import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  BOX_SCHEMA_HINT_PREFIX,
  CONTEXT_BLOCK_PREFIX,
  INSTRUCTION_SEPARATOR,
  TOOL_POLICY_PREFIX,
  USER_MESSAGE_BLOCK_PREFIX,
  buildBoxSchemaHint,
  buildContextEnvelope,
  buildMessagesForAgent,
  buildSystemInstructions,
  buildToolsSystemSuffix,
  serializeContext,
} from '../lib/prompt.js';

test('buildToolsSystemSuffix returns empty string for empty tools', () => {
  assert.equal(buildToolsSystemSuffix({}), '');
});

test('buildSystemInstructions appends tools policy with tool names', () => {
  const out = buildSystemInstructions('helper', { add: {}, randomNumber: {} });
  assert.match(out, /^helper/);
  assert.match(out, new RegExp(TOOL_POLICY_PREFIX, 'i'));
  assert.match(out, /add/);
  assert.match(out, /randomNumber/);
});

test('buildBoxSchemaHint uses deterministic object key ordering', () => {
  const schema = z.object({ zeta: z.number(), alpha: z.string() });
  const hint = buildBoxSchemaHint(schema);
  assert.ok(hint.includes(BOX_SCHEMA_HINT_PREFIX));
  assert.ok(hint.indexOf('"alpha": string') < hint.indexOf('"zeta": number'));
});

test('buildBoxSchemaHint unwraps common wrappers and describes unions/arrays', () => {
  const schema = z.object({
    value: z.union([z.string(), z.number()]).optional(),
    list: z.array(z.boolean()).nullable().default([]),
    transformed: z.string().transform((v) => v.trim()),
  });

  const hint = buildBoxSchemaHint(schema);
  assert.match(hint, /"value": string \| number/);
  assert.match(hint, /"list": boolean\[\]/);
  assert.match(hint, /"transformed": string/);
});

test('buildContextEnvelope composes context and user message sections', () => {
  const out = buildContextEnvelope('hello', '{"requestId":"1"}');
  assert.ok(out.includes(CONTEXT_BLOCK_PREFIX));
  assert.ok(out.includes(USER_MESSAGE_BLOCK_PREFIX));
  assert.ok(out.includes(INSTRUCTION_SEPARATOR));
  assert.match(out, /hello/);
});

test('buildMessagesForAgent replaces only last user message when enriched', () => {
  const history = [
    { role: 'system', content: 's' },
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'second' },
  ];

  const out = buildMessagesForAgent(history, 'ENRICHED', 'second');
  assert.equal(out.length, history.length);
  assert.equal(out[1].content, 'first');
  assert.equal(out[3].content, 'ENRICHED');
});

test('buildMessagesForAgent replaces last user message with multipart content', () => {
  const history = [
    { role: 'system', content: 's' },
    { role: 'user', content: 'hello' },
  ];
  const multipart = [
    { type: 'text', text: 'hello' },
    { type: 'image', image: 'https://example.com/cat.png' },
  ];

  const out = buildMessagesForAgent(history, 'hello', 'hello', multipart);
  assert.deepEqual(out[1].content, multipart);
});

test('buildMessagesForAgent is a no-op when last message is not user', () => {
  const history = [
    { role: 'system', content: 's' },
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'a1' },
  ];

  const out = buildMessagesForAgent(history, 'ENRICHED', 'first');
  assert.deepEqual(out, history);
});

test('buildBoxSchemaHint falls back to unknown for unsupported schema node', () => {
  const fakeSchema = { _def: { typeName: 'ZodSomeFutureType' } };
  const hint = buildBoxSchemaHint(fakeSchema);
  assert.ok(hint.includes(BOX_SCHEMA_HINT_PREFIX));
  assert.match(hint, /unknown/);
});

test('buildBoxSchemaHint supports v4-like schema internals', () => {
  const v4String = { _zod: { def: { type: 'string' } } };
  const v4Number = { _zod: { def: { type: 'number' } } };
  const v4OptionalString = { _zod: { def: { type: 'optional', innerType: v4String } } };
  const v4ArrayOptionalString = { _zod: { def: { type: 'array', element: v4OptionalString } } };
  const v4Union = { _zod: { def: { type: 'union', options: [v4String, v4Number] } } };
  const v4Object = {
    _zod: {
      def: {
        type: 'object',
        shape: {
          zeta: v4Union,
          alpha: v4ArrayOptionalString,
        },
      },
    },
  };

  const hint = buildBoxSchemaHint(v4Object);
  assert.ok(hint.includes(BOX_SCHEMA_HINT_PREFIX));
  assert.ok(hint.indexOf('"alpha": string[]') < hint.indexOf('"zeta": string | number'));
});

test('serializeContext redacts secrets and handles toJSON undefined fallback', () => {
  const out = serializeContext({
    password: 'pw',
    token: 'abc',
    nested: { apiKey: 'k', api_key: 'k2', secretThing: 'x' },
  });
  assert.match(out, /\[REDACTED\]/);

  const blank = serializeContext({
    toJSON() {
      return undefined;
    },
  });
  assert.equal(blank, '');
});

test('serializeContext handles circular values and bigint safely', () => {
  const circular = { id: 1n };
  circular.self = circular;

  const out = serializeContext(circular);
  assert.match(out, /"id": "1"/);
  assert.match(out, /"self": "\[Circular\]"/);
});

test('serializeContext returns empty string when toJSON throws', () => {
  const out = serializeContext({
    toJSON() {
      throw new Error('boom');
    },
  });

  assert.equal(out, '');
});

test('buildBoxSchemaHint handles literal, enum fallback, and union fallback branches', () => {
  const fakeLiteral = { _def: { typeName: 'ZodLiteral', value: 'ok' } };
  const fakeEnumValuesFromEntries = { _zod: { def: { type: 'enum', entries: { A: 'A', B: 'B' } } } };
  const fakeEnumFallback = { _zod: { def: { type: 'enum', values: { bad: true } } } };
  const fakeUnionFallback = { _zod: { def: { type: 'union', options: { bad: true } } } };
  const fakeV4Transform = { _zod: { def: { type: 'transform', schema: fakeLiteral } } };

  const hint = buildBoxSchemaHint({
    _zod: {
      def: {
        type: 'object',
        shape: {
          a: fakeLiteral,
          b: fakeEnumValuesFromEntries,
          c: fakeEnumFallback,
          d: fakeUnionFallback,
          e: fakeV4Transform,
        },
      },
    },
  });

  assert.match(hint, /"a": "ok"/);
  assert.match(hint, /"b": "A" \| "B"/);
  assert.match(hint, /"c": enum/);
  assert.match(hint, /"d": unknown/);
  assert.match(hint, /"e": "ok"/);
});

test('buildBoxSchemaHint unwraps ZodEffects nodes', () => {
  const effectsLike = {
    _def: {
      typeName: 'ZodEffects',
      schema: {
        _def: {
          typeName: 'ZodString',
        },
      },
    },
  };

  const hint = buildBoxSchemaHint(effectsLike);
  assert.match(hint, /string/);
});
