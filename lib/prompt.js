import { isPlainObject } from './guards.js';

const CONTEXT_CHAR_LIMIT = 4000;

export const TOOL_POLICY_PREFIX =
  'Tool policy: You can use these tools when needed for accurate answers:';
export const TOOL_POLICY_SUFFIX = 'Do not fabricate tool results.';
export const BOX_SCHEMA_HINT_PREFIX =
  'Return ONLY a valid JSON object (no text commentary or markdown) that exactly matches this schema (field names/types required):';
export const CONTEXT_BLOCK_PREFIX = 'Context (JSON):';
export const USER_MESSAGE_BLOCK_PREFIX = 'User message:';
export const INSTRUCTION_SEPARATOR = '\n\n';

export function buildToolsSystemSuffix(tools) {
  const toolNames = Object.keys(tools);
  if (toolNames.length === 0) {
    return '';
  }

  return `${INSTRUCTION_SEPARATOR}${TOOL_POLICY_PREFIX} ${toolNames.join(', ')}. ${TOOL_POLICY_SUFFIX}`;
}

export function buildSystemInstructions(personality, tools) {
  return `${personality}${buildToolsSystemSuffix(tools)}`;
}

export function serializeContext(context) {
  if (context === null || context === undefined) {
    return '';
  }

  if (!isPlainObject(context)) {
    throw new TypeError('Kimten play(input, context) expects context to be a plain object when provided.');
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

function unwrapZodSchema(schema) {
  // This uses Zod internals (`_def.typeName`) intentionally as a best-effort
  // schema describer for prompt hints. It should stay tolerant to unknown nodes.
  let current = schema;
  let guard = 0;
  while (current && guard < 20) {
    guard += 1;
    const typeName = current?._def?.typeName;
    if (
      typeName === 'ZodOptional' ||
      typeName === 'ZodNullable' ||
      typeName === 'ZodDefault' ||
      typeName === 'ZodBranded' ||
      typeName === 'ZodReadonly' ||
      typeName === 'ZodCatch'
    ) {
      current = current._def.innerType;
      continue;
    }
    if (typeName === 'ZodEffects') {
      current = current._def.schema;
      continue;
    }
    if (typeName === 'ZodPipeline') {
      current = current._def.out;
      continue;
    }
    break;
  }
  return current;
}

function describeZodSchema(schema) {
  const s = unwrapZodSchema(schema);
  const typeName = s?._def?.typeName;

  if (typeName === 'ZodString') return 'string';
  if (typeName === 'ZodNumber') return 'number';
  if (typeName === 'ZodBoolean') return 'boolean';
  if (typeName === 'ZodNull') return 'null';
  if (typeName === 'ZodAny' || typeName === 'ZodUnknown') return 'any';
  if (typeName === 'ZodLiteral') return JSON.stringify(s._def.value);
  if (typeName === 'ZodEnum') return s._def.values.map((v) => JSON.stringify(v)).join(' | ');
  if (typeName === 'ZodNativeEnum') return 'enum';
  if (typeName === 'ZodArray') return `${describeZodSchema(s._def.type)}[]`;
  if (typeName === 'ZodObject') {
    const shape = typeof s._def.shape === 'function' ? s._def.shape() : s._def.shape;
    const keys = Object.keys(shape || {}).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}: ${describeZodSchema(shape[key])}`);
    return `{ ${entries.join(', ')} }`;
  }
  if (typeName === 'ZodUnion') {
    return s._def.options.map((option) => describeZodSchema(option)).join(' | ');
  }

  return 'unknown';
}

export function buildBoxSchemaHint(box) {
  if (!box) {
    return '';
  }

  return `${BOX_SCHEMA_HINT_PREFIX} ${describeZodSchema(box)}`;
}

export function buildContextEnvelope(input, serializedContext) {
  if (!serializedContext) {
    return input;
  }

  return `${CONTEXT_BLOCK_PREFIX}\n${serializedContext}${INSTRUCTION_SEPARATOR}${USER_MESSAGE_BLOCK_PREFIX}\n${input}`;
}

export function buildEffectiveInput(input, serializedContext, box) {
  const baseInput = buildContextEnvelope(input, serializedContext);
  const boxSchemaHint = buildBoxSchemaHint(box);

  if (!boxSchemaHint) {
    return baseInput;
  }

  return `${boxSchemaHint}${INSTRUCTION_SEPARATOR}${baseInput}`;
}

export function buildMessagesForAgent(memoryMessages, effectiveInput, rawInput) {
  const lastMessage = memoryMessages[memoryMessages.length - 1];
  const shouldReplaceLastUserMessage = effectiveInput !== rawInput;

  if (!shouldReplaceLastUserMessage || lastMessage?.role !== 'user') {
    return memoryMessages;
  }

  return [...memoryMessages.slice(0, -1), { ...lastMessage, content: effectiveInput }];
}
