import { ToolLoopAgent, stepCountIs, Output } from 'ai';
import { createMemory } from './memory.js';
import { normalizeToys } from './tools.js';

const DEFAULT_PERSONALITY = 'You are a helpful assistant.';
const CONTEXT_CHAR_LIMIT = 4000;

/**
 * @typedef {import('zod').ZodTypeAny} ZodSchema
 */

/**
 * A minimal AI SDK model-like object accepted by Kimten.
 *
 * This is intentionally loose to avoid coupling Kimten to AI SDK internal types,
 * while still providing useful IDE hints.
 *
 * @typedef {object} BrainModel
 * @property {string} [specificationVersion]
 * @property {string} [provider]
 * @property {string} [modelId]
 * @property {Record<string, unknown>} [supportedUrls]
 */

/**
 * Tool execute function.
 *
 * @callback ToolExecute
 * @param {any} args
 * @returns {any | Promise<any>}
 */

/**
 * Object-form tool definition.
 *
 * @typedef {object} ToyDefinition
 * @property {import('zod').ZodTypeAny} [inputSchema]
 * @property {string} [description]
 * @property {boolean} [strict]
 * @property {ToolExecute} execute
 */

/**
 * Tool registry map.
 *
 * @typedef {Record<string, ToyDefinition>} Toys
 */

/**
 * Kimten factory config.
 *
 * @typedef {object} KimtenConfig
 * @property {BrainModel} brain AI SDK model instance.
 * @property {Toys} [toys] Tool registry.
 * @property {string} [personality] System prompt / instructions.
 * @property {number} [hops] Max loop steps (prevents infinite loops).
 */

/**
 * Returned Kimten instance.
 *
 * @typedef {object} KimtenAgent
 * @property {(input: string, schema?: ZodSchema | null, context?: Record<string, unknown> | null) => Promise<any>} play Run the agent loop.
 * @property {() => void} forget Clear short-term memory.
 */

function validateConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Kimten requires a config object.');
  }

  const { brain, toys = {}, personality = null, hops = 10 } = config;

  if (!brain || typeof brain !== 'object') {
    throw new TypeError('Kimten config "brain" is required and must be an AI SDK model instance.');
  }

  const resolvedPersonality = personality ?? DEFAULT_PERSONALITY;
  if (typeof resolvedPersonality !== 'string' || resolvedPersonality.trim() === '') {
    throw new TypeError('Kimten config "personality" must be a non-empty string when provided.');
  }

  if (!Number.isInteger(hops) || hops <= 0) {
    throw new TypeError('Kimten config "hops" must be a positive integer.');
  }

  return {
    brain,
    toys,
    personality: resolvedPersonality,
    hops,
  };
}

function serializeContext(context) {
  if (context === null || context === undefined) {
    return '';
  }

  if (typeof context !== 'object' || Array.isArray(context)) {
    throw new TypeError('Kimten play(input, schema, context) expects context to be a plain object when provided.');
  }

  const redacted = JSON.stringify(
    context,
    (key, value) => {
      const lowered = String(key).toLowerCase();
      if (
        lowered.includes('password') ||
        lowered.includes('token') ||
        lowered.includes('secret') ||
        lowered.includes('apikey') ||
        lowered.includes('api_key')
      ) {
        return '[REDACTED]';
      }

      return value;
    },
    2
  );

  if (typeof redacted !== 'string') {
    return '';
  }

  if (redacted.length <= CONTEXT_CHAR_LIMIT) {
    return redacted;
  }

  return `${redacted.slice(0, CONTEXT_CHAR_LIMIT)}\n...(truncated)`;
}

/**
 * Create a tiny tool-using agent with short-term memory.
 *
 * @param {KimtenConfig} config
 * @returns {KimtenAgent}
 */
export function Kimten(config) {
  const { brain, toys, personality, hops } = validateConfig(config);
  const memory = createMemory();
  const tools = normalizeToys(toys);
  const structuredAgents = new WeakMap(); // Cache for agents based on output schema

  const textAgent = new ToolLoopAgent({
    model: brain,
    instructions: personality,
    tools,
    stopWhen: stepCountIs(hops),
  });

  function createStructuredAgent(schema) {
    return new ToolLoopAgent({
      model: brain,
      instructions: personality,
      tools,
      stopWhen: stepCountIs(hops),
      output: Output.object({ schema }),
    });
  }

  function getStructuredAgent(schema) {
    if (schema !== null && (typeof schema === 'object' || typeof schema === 'function')) {
      const cached = structuredAgents.get(schema);
      if (cached) {
        return cached;
      }

      const created = createStructuredAgent(schema);
      structuredAgents.set(schema, created);
      return created;
    }

    return createStructuredAgent(schema);
  }

  /**
   * Run the agent loop.
   *
   * - Stores the conversation in short-term memory (in-process, per instance).
   * - If `schema` is provided, returns structured output (via AI SDK output mode).
   *
   * @param {string} input
   * @param {ZodSchema | null} [schema]
   * @param {Record<string, unknown> | null} [context]
   * @returns {Promise<any>}
   */
  async function play(input, schema = null, context = null) {
    if (typeof input !== 'string') {
      throw new TypeError('Kimten play(input) expects input to be a string.');
    }

    // Serialize provided context (redacts sensitive keys and truncates if too long).
    const serializedContext = serializeContext(context);

    // If we have context, embed it before the user's message so the agent sees both.
    const effectiveInput = serializedContext
      ? `Context (JSON):\n${serializedContext}\n\nUser message:\n${input}`
      : input;

    // Store the raw user message (no context) in short-term memory.
    memory.add({ role: 'user', content: input });

    // Retrieve conversation so far from memory.
    const fetchedMessages = memory.list();

    // If the last message is the user message we just added, we may need to replace it with
    // a version that includes the serialized context, so the agent can see that information.
    // This way we keep the raw user message in memory, but provide the agent with the enriched version.
    const lastMessage = fetchedMessages[fetchedMessages.length - 1];
    const messages = serializedContext && lastMessage?.role === 'user'
      ? [...fetchedMessages.slice(0, -1), { ...lastMessage, content: effectiveInput }]
      : fetchedMessages;

    // Choose a structured agent when a schema is provided, otherwise use the text agent.
    const agent = schema ? getStructuredAgent(schema) : textAgent;

    // Run the agent loop with the prepared messages.
    const result = await agent.generate({ messages });

    const assistantContent =
      schema
        ? (typeof result.text === 'string' && result.text.trim() !== ''
            ? result.text
            : JSON.stringify(result.output ?? null))
        : (typeof result.text === 'string' ? result.text : '');

    memory.add({ role: 'assistant', content: assistantContent });

    return schema ? result.output : assistantContent;
  }

  /**
   * Clear short-term memory for this instance.
   *
   * @returns {void}
   */
  function forget() {
    memory.clear();
  }

  return {
    play,
    forget,
  };
}
