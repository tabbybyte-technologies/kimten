import { ToolLoopAgent, stepCountIs, Output } from 'ai';
import { Buffer } from 'node:buffer';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { createMemory } from './memory.js';
import { normalizeToys } from './tools.js';
import { isPlainObject } from './guards.js';
import {
  buildEffectiveInput,
  buildMessagesForAgent,
  buildSystemInstructions,
  serializeContext,
} from './prompt.js';

const DEFAULT_PERSONALITY = 'You are a helpful assistant.';
const ALLOWED_PLAY_OPTIONS_KEYS = new Set([
  'attachments',
  'temperature',
  'topP',
  'topK',
  'maxOutputTokens',
]);

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
 * @property {(input: string, context?: Record<string, unknown> | null, options?: PlayOptions) => Promise<any>} play Run the agent loop.
 * @property {() => void} forget Clear short-term memory.
 */

/**
 * @typedef {string | URL | Buffer | Uint8Array | ArrayBuffer} KimtenAttachmentSource
 */

/**
 * @typedef {object} KimtenImageAttachment
 * @property {'image'} kind
 * @property {KimtenAttachmentSource} image
 * @property {string} [mediaType]
 */

/**
 * @typedef {object} KimtenFileAttachment
 * @property {'file'} kind
 * @property {KimtenAttachmentSource} data
 * @property {string} mediaType
 * @property {string} [filename]
 */

/**
 * @typedef {KimtenImageAttachment | KimtenFileAttachment} KimtenAttachment
 */

/**
 * @typedef {object} PlayOptions
 * @property {KimtenAttachment[]} [attachments]
 * @property {number} [temperature]
 * @property {number} [topP]
 * @property {number} [topK]
 * @property {number} [maxOutputTokens]
 */

function isAttachmentSource(value) {
  if (typeof value === 'string') {
    return true;
  }

  if (value instanceof URL) {
    return true;
  }

  if (Buffer.isBuffer(value)) {
    return true;
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return true;
  }

  return false;
}

function toCandidateLocalPath(value) {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('data:') || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

async function tryReadLocalFile(value) {
  const path = toCandidateLocalPath(value);
  if (!path) {
    return null;
  }

  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return null;
    }

    return {
      bytes: await readFile(path),
      path,
    };
  } catch {
    return null;
  }
}

async function resolveAttachmentPayloads(attachments) {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.type === 'image' && typeof attachment.image === 'string') {
        const local = await tryReadLocalFile(attachment.image);
        if (local) {
          return {
            ...attachment,
            image: local.bytes,
          };
        }
      }

      if (attachment.type === 'file' && typeof attachment.data === 'string') {
        const local = await tryReadLocalFile(attachment.data);
        if (local) {
          return {
            ...attachment,
            data: local.bytes,
            ...(attachment.filename ? {} : { filename: basename(local.path) }),
          };
        }
      }

      return attachment;
    })
  );
}

/**
 * @param {PlayOptions | undefined} options
 * @returns {{
 *   attachments: Array<Record<string, unknown>>,
 *   callOptions: Record<string, number>
 * }}
 */
function validatePlayOptions(options) {
  if (options === undefined || options === null) {
    return { attachments: [], callOptions: {} };
  }

  if (!isPlainObject(options)) {
    throw new TypeError('Kimten play(input, context, options) expects options to be a plain object when provided.');
  }

  for (const key of Object.keys(options)) {
    if (!ALLOWED_PLAY_OPTIONS_KEYS.has(key)) {
      throw new TypeError(
        `Kimten play(input, context, options) does not support option "${key}". Allowed options: attachments, temperature, topP, topK, maxOutputTokens.`
      );
    }
  }

  const callOptions = {};
  const numericKeys = ['temperature', 'topP', 'topK'];
  for (const key of numericKeys) {
    const value = options[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new TypeError(`Kimten play(input, context, options) option "${key}" must be a number when provided.`);
    }
    callOptions[key] = value;
  }

  if (options.maxOutputTokens !== undefined) {
    if (!Number.isInteger(options.maxOutputTokens) || options.maxOutputTokens < 1) {
      throw new TypeError(
        'Kimten play(input, context, options) option "maxOutputTokens" must be an integer >= 1 when provided.'
      );
    }
    callOptions.maxOutputTokens = options.maxOutputTokens;
  }

  if (options.attachments === undefined) {
    return { attachments: [], callOptions };
  }

  if (!Array.isArray(options.attachments)) {
    throw new TypeError('Kimten play(input, context, options) option "attachments" must be an array when provided.');
  }

  const attachments = options.attachments.map((attachment, index) => {
    if (!isPlainObject(attachment)) {
      throw new TypeError(
        `Kimten play(input, context, options) attachment at index ${index} must be a plain object.`
      );
    }

    if (attachment.kind === 'image') {
      if (!isAttachmentSource(attachment.image)) {
        throw new TypeError(
          `Kimten play(input, context, options) image attachment at index ${index} must include "image" as string, URL, Buffer, Uint8Array, or ArrayBuffer.`
        );
      }

      if (attachment.mediaType !== undefined && typeof attachment.mediaType !== 'string') {
        throw new TypeError(
          `Kimten play(input, context, options) image attachment at index ${index} has invalid "mediaType" (string expected).`
        );
      }

      return {
        type: 'image',
        image: attachment.image,
        ...(attachment.mediaType ? { mediaType: attachment.mediaType } : {}),
      };
    }

    if (attachment.kind === 'file') {
      if (!isAttachmentSource(attachment.data)) {
        throw new TypeError(
          `Kimten play(input, context, options) file attachment at index ${index} must include "data" as string, URL, Buffer, Uint8Array, or ArrayBuffer.`
        );
      }

      if (typeof attachment.mediaType !== 'string' || attachment.mediaType.trim() === '') {
        throw new TypeError(
          `Kimten play(input, context, options) file attachment at index ${index} must include a non-empty "mediaType" string.`
        );
      }

      if (attachment.filename !== undefined && typeof attachment.filename !== 'string') {
        throw new TypeError(
          `Kimten play(input, context, options) file attachment at index ${index} has invalid "filename" (string expected).`
        );
      }

      return {
        type: 'file',
        data: attachment.data,
        mediaType: attachment.mediaType,
        ...(attachment.filename ? { filename: attachment.filename } : {}),
      };
    }

    throw new TypeError(
      `Kimten play(input, context, options) attachment at index ${index} has invalid "kind". Expected "image" or "file".`
    );
  });

  return { attachments, callOptions };
}

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

function createKimtenId() {
  const randomPart = Math.random().toString(36).slice(2, 9).padEnd(7, '0');
  return `kimten_${randomPart}`;
}

/**
 * Create a tiny tool-using agent with short-term memory.
 *
 * @param {KimtenConfig} config
 * @returns {KimtenAgent}
 */
export function Kimten(config) {
  const { brain, toys, personality, hops, box } = validateConfig(config);
  const _id = createKimtenId();
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
   * @param {PlayOptions} [options]
   * @returns {Promise<any>}
   */
  async function play(input, context = null, options = undefined) {
    if (typeof input !== 'string') {
      throw new TypeError('Kimten play(input) expects input to be a string.');
    }

    const { attachments, callOptions } = validatePlayOptions(options);
    const resolvedAttachments = await resolveAttachmentPayloads(attachments);

    // Serialize provided context (redacts sensitive keys and truncates if too long).
    const serializedContext = serializeContext(context);
    const effectiveInput = buildEffectiveInput(input, serializedContext, box);
    const outboundUserContent = resolvedAttachments.length > 0
      ? [{ type: 'text', text: effectiveInput }, ...resolvedAttachments]
      : effectiveInput;

    // Store the raw user message (no context) in short-term memory.
    memory.add({ role: 'user', content: input });

    // Retrieve conversation so far from memory.
    const fetchedMessages = memory.list();

    // Keep raw user text in memory but enrich the outbound last user message for this call.
    const messages = buildMessagesForAgent(fetchedMessages, effectiveInput, input, outboundUserContent);

    // Run the agent loop with the prepared messages.
    const result = await agent.generate({ messages, ...callOptions });

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
