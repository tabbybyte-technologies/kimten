import { tool } from 'ai';
import { z } from 'zod';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function normalizeToys(toys) {
  if (toys === undefined || toys === null) {
    return {};
  }

  if (!isPlainObject(toys)) {
    throw new TypeError('Kimten config "toys" must be an object map of functions.');
  }

  const wrapped = {};

  for (const [name, fn] of Object.entries(toys)) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Kimten tool "${name}" must be a function.`);
    }

    wrapped[name] = tool({
      inputSchema: z.any(),
      async execute(args) {
        try {
          const result = await fn(args);
          return toJsonSafe(result);
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            toolName: name,
          };
        }
      },
    });
  }

  return wrapped;
}

function toJsonSafe(value) {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { value: String(value) };
  }
}
