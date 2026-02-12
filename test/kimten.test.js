/**
 * @module kimten.test
 * @description
 * Unit tests for the Kimten library, covering:
 * - Memory behavior and FIFO eviction via createMemory()
 * - Tool normalization and validation via normalizeToys()
 * - Kimten factory validation, behavior, and caching (play/forget)
 *
 * Helpers:
 * @function createFakeModel
 * @param {Object} opts
 * @param {string} opts.text - Text to return as the model generation result.
 * @returns {Object} Minimal fake model implementation compatible with tests.
 *
 * @function createSpyModel
 * @param {Object} opts
 * @param {string} opts.text - Text to return as the model generation result.
 * @param {Array} opts.prompts - Array to which invoked prompts will be pushed.
 * @returns {Object} Fake model that records prompts passed to doGenerate().
 *
 * Test coverage highlights:
 * - createMemory enforces MEMORY_LIMIT and supports clear() and list().
 * - normalizeToys:
 *   - accepts object-form tool definitions with description, inputSchema, strict flag
 *   - rejects shorthand function tools
 *   - serializes thrown errors and circular/undefined results safely
 *   - rejects non-plain objects and invalid property types
 * - Kimten:
 *   - validates constructor arguments (config object, brain, personality, hops)
 *   - exposes only play() and forget() methods
 *   - enforces play() input type (string)
 *   - supports optional personality and toys
 *   - returns structured output when given a Zod schema and caches structured agents
 *   - forget() clears conversation memory so subsequent prompts omit assistant history
 * 
 * Note: These tests are not exhaustive but cover key behaviors and edge cases of the Kimten library.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createMemory, MEMORY_LIMIT } from '../lib/memory.js';
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

function createSpyModel({ text, prompts }) {
  return {
    specificationVersion: 'v2',
    provider: 'test',
    modelId: 'fake',
    supportedUrls: {},
    async doGenerate(options) {
      prompts.push(options.prompt);
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

test('normalizeToys supports object-form tool definitions', async () => {
  const wrapped = normalizeToys({
    add: {
      description: 'Adds two numbers.',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      async execute({ a, b }) {
        return a + b;
      },
    },
  });

  assert.equal(typeof wrapped.add.execute, 'function');
  const out = await wrapped.add.execute({ a: 2, b: 3 });
  assert.equal(out, 5);
});

test('normalizeToys rejects shorthand function tools', () => {
  assert.throws(
    () => normalizeToys({ add: async ({ a, b }) => a + b }),
    /must be an object with execute/i
  );
});

test('normalizeToys serializes tool errors safely', async () => {
  const wrapped = normalizeToys({
    boom: {
      async execute() {
        throw new Error('failed');
      },
    },
  });

  const out = await wrapped.boom.execute({});
  assert.equal(out.error, 'failed');
  assert.equal(out.toolName, 'boom');
});

test('normalizeToys rejects non-object tool entries', () => {
  assert.throws(() => normalizeToys({ bad: 1 }), /must be an object with execute/i);
});

test('normalizeToys rejects object-form entries without execute', () => {
  assert.throws(
    () => normalizeToys({ bad: { inputSchema: z.object({ a: z.number() }) } }),
    /must include execute/i
  );
});

test('normalizeToys returns empty map for nullish input', () => {
  assert.deepEqual(normalizeToys(undefined), {});
  assert.deepEqual(normalizeToys(null), {});
});

test('normalizeToys rejects non-plain objects', () => {
  assert.throws(() => normalizeToys([]), /must be an object map/i);
  assert.throws(() => normalizeToys(new Map()), /must be an object map/i);
});

test('normalizeToys validates tool description and strict types', () => {
  assert.throws(
    () =>
      normalizeToys({
        bad: { description: 1, async execute() {} },
      }),
    /description must be a string/i
  );

  assert.throws(
    () =>
      normalizeToys({
        bad: { strict: 'no', async execute() {} },
      }),
    /strict must be a boolean/i
  );
});

test('normalizeToys serializes undefined results as null', async () => {
  const wrapped = normalizeToys({
    noop: {
      async execute() {
        return undefined;
      },
    },
  });

  const out = await wrapped.noop.execute({});
  assert.equal(out, null);
});

test('normalizeToys serializes circular tool results safely', async () => {
  const wrapped = normalizeToys({
    circular: {
      async execute() {
        const obj = {};
        obj.self = obj;
        return obj;
      },
    },
  });

  const out = await wrapped.circular.execute({});
  assert.equal(typeof out.value, 'string');
});

test('Kimten validates constructor config', () => {
  assert.throws(() => Kimten(null), /requires a config object/i);
  assert.throws(() => Kimten({ toys: {} }), /brain/i);
  assert.throws(() => Kimten({ brain: 1 }), /brain/i);
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

test('Kimten caches structured agents for the same schema instance', async () => {
  const cat = Kimten({
    brain: createFakeModel({ text: '{"name":"kim"}' }),
    toys: {},
    personality: 'helper',
  });

  const schema = z.object({ name: z.string() });
  const out1 = await cat.play('extract name', schema);
  const out2 = await cat.play('extract name again', schema);

  assert.deepEqual(out1, { name: 'kim' });
  assert.deepEqual(out2, { name: 'kim' });
});

test('Kimten forget clears conversation memory', async () => {
  const prompts = [];
  const cat = Kimten({
    brain: createSpyModel({ text: 'ok', prompts }),
    toys: {},
    personality: 'helper',
  });

  await cat.play('one');
  await cat.play('two');
  cat.forget();
  await cat.play('three');

  assert.equal(prompts.length, 3);

  const roles1 = prompts[0].map((m) => m.role);
  const roles2 = prompts[1].map((m) => m.role);
  const roles3 = prompts[2].map((m) => m.role);

  assert.ok(roles2.includes('assistant'));
  assert.ok(!roles3.includes('assistant'));
  assert.deepEqual(roles1, ['system', 'user']);
  assert.deepEqual(roles3, ['system', 'user']);
});

test('Kimten play accepts optional context object', async () => {
  const cat = Kimten({
    brain: createFakeModel({ text: 'ok' }),
    toys: {},
    personality: 'helper',
  });

  const out = await cat.play('hi', null, { requestId: 'req-1' });
  assert.equal(out, 'ok');
});

test('Kimten injects context into the user prompt content', async () => {
  const prompts = [];
  const cat = Kimten({
    brain: createSpyModel({ text: 'ok', prompts }),
    toys: {},
    personality: 'helper',
  });

  await cat.play('hello', null, {
    requestId: 'req-1',
    token: 'super-secret-token',
  });

  const userMessage = prompts[0].find((m) => m.role === 'user');
  assert.ok(userMessage);
  const userText = Array.isArray(userMessage.content)
    ? userMessage.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
    : userMessage.content;
  assert.match(userText, /Context \(JSON\):/i);
  assert.match(userText, /"requestId": "req-1"/);
  assert.match(userText, /"token": "\[REDACTED\]"/);
  assert.match(userText, /User message:\nhello/);
});

test('Kimten context is ephemeral and not persisted across plays', async () => {
  const prompts = [];
  const cat = Kimten({
    brain: createSpyModel({ text: 'ok', prompts }),
    toys: {},
    personality: 'helper',
  });

  await cat.play('first', null, { requestId: 'req-1' });
  await cat.play('second');

  const firstUser = prompts[0].find((m) => m.role === 'user');
  const secondUser = [...prompts[1]].reverse().find((m) => m.role === 'user');

  const firstText = Array.isArray(firstUser.content)
    ? firstUser.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
    : firstUser.content;
  const secondText = Array.isArray(secondUser.content)
    ? secondUser.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
    : secondUser.content;

  assert.match(firstText, /Context \(JSON\):/i);
  assert.doesNotMatch(secondText, /Context \(JSON\):/i);
});
