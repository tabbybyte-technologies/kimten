import { ToolLoopAgent, stepCountIs, Output } from 'ai';
import { createMemory } from './memory.js';
import { normalizeToys } from './tools.js';
import { validateConfig } from './config.js';
import { validatePlayOptions } from './play-options.js';
import { resolveAttachmentPayloads } from './attachments.js';
import {
  buildEffectiveInput,
  buildMessagesForAgent,
  buildSystemInstructions,
  serializeContext,
} from './prompt.js';

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
 * @property {string} [name] Optional instance tag.
 * @property {string} [personality] System prompt / instructions.
 * @property {number} [hops] Max loop steps (prevents infinite loops).
 * @property {ZodSchema} [box] Optional output schema fixed for this instance.
 */

/**
 * Returned Kimten instance.
 *
 * @typedef {object} KimtenAgent
 * @property {string | undefined} name Optional public instance tag.
 * @property {(input: string, context?: Record<string, unknown> | null, options?: PlayOptions) => Promise<any>} play Run the agent loop.
 * @property {() => void} forget Clear short-term memory.
 */

/**
 * @typedef {object} PlayOptions
 * @property {Array<Record<string, unknown>>} [attachments]
 * @property {number} [temperature]
 * @property {number} [topP]
 * @property {number} [topK]
 * @property {number} [maxOutputTokens]
 */

function toAssistantMemoryContent(result, box) {
  if (!box) {
    return typeof result.text === 'string' ? result.text : '';
  }

  if (typeof result.text === 'string' && result.text.trim() !== '') {
    return result.text;
  }

  /* node:coverage ignore next -- defensive fallback for SDK result-shape edge cases */
  return JSON.stringify(result.output ?? null);
}

function buildOutboundUserContent(effectiveInput, attachments) {
  return attachments.length > 0
    ? [{ type: 'text', text: effectiveInput }, ...attachments]
    : effectiveInput;
}

/**
 * Create a tiny tool-using agent with short-term memory.
 *
 * @param {KimtenConfig} config
 * @returns {KimtenAgent}
 */
export function Kimten(config) {
  const { brain, toys, name, personality, hops, box } = validateConfig(config);
  const memory = createMemory();
  const tools = normalizeToys(toys);
  const instructions = buildSystemInstructions(personality, tools);
  let playQueue = Promise.resolve();

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
   * @param {PlayOptions} [options]
   * @returns {Promise<any>}
   */
  async function playOnce(input, context = null, options = undefined) {
    if (typeof input !== 'string') {
      throw new TypeError('Kimten play(input) expects input to be a string.');
    }

    const { attachments, callOptions } = validatePlayOptions(options);
    const resolvedAttachments = await resolveAttachmentPayloads(attachments);

    // Serialize provided context (redacts sensitive keys and truncates if too long).
    const serializedContext = serializeContext(context);
    const effectiveInput = buildEffectiveInput(input, serializedContext, box);
    const outboundUserContent = buildOutboundUserContent(effectiveInput, resolvedAttachments);

    // Build outbound messages from memory snapshot and current user turn,
    // but commit to memory only after a successful generation.
    const fetchedMessages = [...memory.list(), { role: 'user', content: input }];

    // Keep raw user text in memory but enrich the outbound last user message for this call.
    const messages = buildMessagesForAgent(fetchedMessages, effectiveInput, input, outboundUserContent);

    // Run the agent loop with the prepared messages.
    const result = await agent.generate({ messages, ...callOptions });

    const assistantContent = toAssistantMemoryContent(result, box);

    memory.add({ role: 'user', content: input });
    memory.add({ role: 'assistant', content: assistantContent });

    return box ? result.output : assistantContent;
  }

  async function play(input, context = null, options = undefined) {
    const run = playQueue.then(() => playOnce(input, context, options));
    playQueue = run.catch(() => {});
    return run;
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
    ...(name !== undefined ? { name } : {}),
    play,
    forget,
  };
}
