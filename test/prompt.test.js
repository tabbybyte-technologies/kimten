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
