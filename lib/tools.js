import { tool } from 'ai';
import { z } from 'zod';
import { isPlainObject } from './guards.js';

/**
 * @typedef {import('zod').ZodTypeAny} ZodSchema
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
 * @property {ZodSchema} [inputSchema]
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
 * Normalize a toy registry into AI SDK tool objects.
 *
 * - Object form only: `{ inputSchema?, description?, strict?, execute }`
 *
 * Tool execution is wrapped so thrown errors become JSON-safe results:
 * `{ error, toolName }` (Kimten does not re-throw tool errors).
 *
 * @param {Toys | null | undefined} toys
 * @returns {Record<string, ReturnType<typeof tool>>}
 */
export function normalizeToys(toys) {
  if (toys === undefined || toys === null) {
    return {};
  }

  if (!isPlainObject(toys)) {
    throw new TypeError('Kimten config "toys" must be an object map of tool definitions.');
  }

  const wrapped = {};

  for (const [name, entry] of Object.entries(toys)) {
    if (name.trim() === '') {
      throw new TypeError('Kimten config "toys" cannot contain an empty tool name.');
    }

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
  if (!isPlainObject(entry)) {
    throw new TypeError(
      `Kimten tool "${name}" must be an object with execute(args).`
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

  if (entry.inputSchema !== undefined && !isZodSchemaLike(entry.inputSchema)) {
    throw new TypeError(`Kimten tool "${name}" inputSchema must be a Zod schema when provided.`);
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

  const seen = new WeakSet();
  try {
    return JSON.parse(
      JSON.stringify(value, (key, current) => {
        if (typeof current === 'bigint') {
          return current.toString();
        }

        if (typeof current === 'object' && current !== null) {
          if (seen.has(current)) {
            return '[Circular]';
          }
          seen.add(current);
        }

        return current;
      })
    );
  } catch {
    return { value: String(value) };
  }
}

function isZodSchemaLike(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  return typeof value.safeParse === 'function' || typeof value.parse === 'function';
}
