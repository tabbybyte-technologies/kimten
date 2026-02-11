import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createMemory, MEMORY_LIMIT } from '../lib/memory.js';
import { buildMessages } from '../lib/prompt.js';
import { normalizeToys } from '../lib/tools.js';
import Kimten, { Kimten as NamedKimten } from '../index.js';

function createFakeModel({ text }) {
  return {
    specificationVersion: 'v2',
    provider: 'test',
    modelId: 'fake',
    supportedUrls: {},
    async doGenerate() {
      return {
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        content: [{ type: 'text', text }],
        warnings: [],
      };
    },
    async doStream() {
      throw new Error('not used');
    },
  };
}

test('default and named exports are the same function', () => {
  assert.equal(typeof Kimten, 'function');
  assert.equal(Kimten, NamedKimten);
});

test('createMemory enforces FIFO memory limit', () => {
  const memory = createMemory();
  for (let i = 0; i < MEMORY_LIMIT + 2; i += 1) {
    memory.add({ role: 'user', content: String(i) });
  }

  const history = memory.list();
  assert.equal(history.length, MEMORY_LIMIT);
  assert.equal(history[0].content, '2');
});

test('createMemory clear empties history', () => {
  const memory = createMemory();
  memory.add({ role: 'user', content: 'hello' });
  memory.clear();
  assert.deepEqual(memory.list(), []);
});

test('buildMessages prepends system prompt', () => {
  const messages = buildMessages('be helpful', [{ role: 'user', content: 'x' }]);
  assert.deepEqual(messages[0], { role: 'system', content: 'be helpful' });
  assert.equal(messages.length, 2);
});

test('normalizeToys validates and wraps tools', async () => {
  const wrapped = normalizeToys({
    add: async ({ a, b }) => a + b,
  });

  assert.equal(typeof wrapped.add.execute, 'function');
  const out = await wrapped.add.execute({ a: 2, b: 3 });
  assert.equal(out, 5);
});

test('normalizeToys serializes tool errors safely', async () => {
  const wrapped = normalizeToys({
    boom: async () => {
      throw new Error('failed');
    },
  });

  const out = await wrapped.boom.execute({});
  assert.equal(out.error, 'failed');
  assert.equal(out.toolName, 'boom');
});

test('normalizeToys rejects non-function tool entries', () => {
  assert.throws(() => normalizeToys({ bad: 1 }), /must be a function/i);
});

test('Kimten validates constructor config', () => {
  assert.throws(() => Kimten(null), /requires a config object/i);
  assert.throws(() => Kimten({ brain: {}, toys: {}, personality: '' }), /personality/i);
  assert.throws(() => Kimten({ brain: {}, toys: {}, personality: 'x', hops: 0 }), /hops/i);
});

test('Kimten returns only play and forget methods', () => {
  const cat = Kimten({
    brain: createFakeModel({ text: 'ok' }),
    toys: {},
    personality: 'helper',
  });

  const keys = Object.keys(cat).sort();
  assert.deepEqual(keys, ['forget', 'play']);
});

test('Kimten play(input) enforces string input', async () => {
  const cat = Kimten({
    brain: createFakeModel({ text: 'ok' }),
    toys: {},
    personality: 'helper',
  });

  await assert.rejects(() => cat.play(1), /expects input to be a string/i);
});

test('Kimten personality is optional', async () => {
  const cat = Kimten({
    brain: createFakeModel({ text: 'ok' }),
    toys: {},
  });

  const out = await cat.play('hi');
  assert.equal(out, 'ok');
});

test('Kimten toys are optional', async () => {
  const cat = Kimten({
    brain: createFakeModel({ text: 'ok' }),
    personality: 'helper',
  });

  const out = await cat.play('hi');
  assert.equal(out, 'ok');
});

test('Kimten play(input, schema) returns structured output via AI SDK output', async () => {
  const cat = Kimten({
    brain: createFakeModel({ text: '{"name":"kim"}' }),
    toys: {},
    personality: 'helper',
  });

  const out = await cat.play('extract name', z.object({ name: z.string() }));
  assert.deepEqual(out, { name: 'kim' });
});
