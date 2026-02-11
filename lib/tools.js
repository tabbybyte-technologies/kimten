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
    throw new TypeError('Kimten config "toys" must be an object map of functions or tool definitions.');
  }

  const wrapped = {};

  for (const [name, entry] of Object.entries(toys)) {
    const definition = normalizeToyDefinition(name, entry);

    wrapped[name] = tool({
      inputSchema: definition.inputSchema,
      ...(definition.description ? { description: definition.description } : {}),
      ...(definition.strict !== undefined ? { strict: definition.strict } : {}),
      async execute(args) {
        try {
          const result = await definition.execute(args);
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

function normalizeToyDefinition(name, entry) {
  if (typeof entry === 'function') {
    return {
      inputSchema: z.any(),
      execute: entry,
    };
  }

  if (!isPlainObject(entry)) {
    throw new TypeError(
      `Kimten tool "${name}" must be a function or an object with execute(args).`
    );
  }

  if (typeof entry.execute !== 'function') {
    throw new TypeError(`Kimten tool "${name}" object form must include execute(args).`);
  }

  if (entry.description !== undefined && typeof entry.description !== 'string') {
    throw new TypeError(`Kimten tool "${name}" description must be a string when provided.`);
  }

  if (entry.strict !== undefined && typeof entry.strict !== 'boolean') {
    throw new TypeError(`Kimten tool "${name}" strict must be a boolean when provided.`);
  }

  return {
    inputSchema: entry.inputSchema ?? z.any(),
    execute: entry.execute,
    description: entry.description,
    strict: entry.strict,
  };
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
