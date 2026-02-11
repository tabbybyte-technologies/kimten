import { ToolLoopAgent, stepCountIs, Output } from 'ai';
import { createMemory } from './memory.js';
import { buildMessages } from './prompt.js';
import { normalizeToys } from './tools.js';

const DEFAULT_PERSONALITY = 'You are a helpful assistant.';

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

export function Kimten(config) {
  const { brain, toys, personality, hops } = validateConfig(config);
  const memory = createMemory();
  const tools = normalizeToys(toys);

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

  async function play(input, schema = null) {
    if (typeof input !== 'string') {
      throw new TypeError('Kimten play(input) expects input to be a string.');
    }

    memory.add({ role: 'user', content: input });

    const agent = schema ? createStructuredAgent(schema) : textAgent;
    const result = await agent.generate({
      messages: buildMessages(personality, memory.list()),
    });

    memory.add({ role: 'assistant', content: result.text });

    return schema ? result.output : result.text;
  }

  function forget() {
    memory.clear();
  }

  return {
    play,
    forget,
  };
}
