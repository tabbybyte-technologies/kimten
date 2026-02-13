import { ToolLoopAgent, stepCountIs, Output } from 'ai';
import { createMemory } from './memory.js';
import { normalizeToys } from './tools.js';
import {
  buildEffectiveInput,
  buildMessagesForAgent,
  buildSystemInstructions,
  serializeContext,
} from './prompt.js';

const DEFAULT_PERSONALITY = 'You are a helpful assistant.';

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
 * @property {ZodSchema} [box] Optional output schema fixed for this instance.
 */

/**
 * Returned Kimten instance.
 *
 * @typedef {object} KimtenAgent
 * @property {(input: string, context?: Record<string, unknown> | null) => Promise<any>} play Run the agent loop.
 * @property {() => void} forget Clear short-term memory.
 */

function validateConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Kimten requires a config object.');
  }

  const { brain, toys = {}, personality = null, hops = 10, box = undefined } = config;

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

  if (box !== undefined && box !== null && typeof box !== 'object' && typeof box !== 'function') {
    throw new TypeError('Kimten config "box" must be a Zod schema when provided.');
  }

  return {
    brain,
    toys,
    personality: resolvedPersonality,
    hops,
    box,
  };
}

/**
 * Create a tiny tool-using agent with short-term memory.
 *
 * @param {KimtenConfig} config
 * @returns {KimtenAgent}
 */
export function Kimten(config) {
  const { brain, toys, personality, hops, box } = validateConfig(config);
  const memory = createMemory();
  const tools = normalizeToys(toys);
  const instructions = buildSystemInstructions(personality, tools);

  const agent = new ToolLoopAgent({
    model: brain,
    instructions,
    tools,
    stopWhen: stepCountIs(hops),
    ...(box ? { output: Output.object({ schema: box }) } : {}),
  });

  /**
   * Run the agent loop.
   *
   * - Stores the conversation in short-term memory (in-process, per instance).
   * - If `box` was configured at initiation, returns structured output.
   *
   * @param {string} input
   * @param {Record<string, unknown> | null} [context]
   * @returns {Promise<any>}
   */
  async function play(input, context = null) {
    if (typeof input !== 'string') {
      throw new TypeError('Kimten play(input) expects input to be a string.');
    }

    // Serialize provided context (redacts sensitive keys and truncates if too long).
    const serializedContext = serializeContext(context);
    const effectiveInput = buildEffectiveInput(input, serializedContext, box);

    // Store the raw user message (no context) in short-term memory.
    memory.add({ role: 'user', content: input });

    // Retrieve conversation so far from memory.
    const fetchedMessages = memory.list();

    // Keep raw user text in memory but enrich the outbound last user message for this call.
    const messages = buildMessagesForAgent(fetchedMessages, effectiveInput, input);

    // Run the agent loop with the prepared messages.
    const result = await agent.generate({ messages });

    const assistantContent =
      box
        ? (typeof result.text === 'string' && result.text.trim() !== ''
            ? result.text
            : JSON.stringify(result.output ?? null))
        : (typeof result.text === 'string' ? result.text : '');

    memory.add({ role: 'assistant', content: assistantContent });

    return box ? result.output : assistantContent;
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
