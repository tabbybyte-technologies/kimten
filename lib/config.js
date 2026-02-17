const DEFAULT_PERSONALITY = 'You are a helpful assistant.';

export function validateConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Kimten requires a config object.');
  }

  const { brain, toys = {}, name = undefined, personality = null, hops = 10, box = undefined } = config;

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

  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    throw new TypeError('Kimten config "name" must be a non-empty string when provided.');
  }

  return {
    brain,
    toys,
    name,
    personality: resolvedPersonality,
    hops,
    box,
  };
}
