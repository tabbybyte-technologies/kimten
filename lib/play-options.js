import { isPlainObject } from './guards.js';
import { normalizeAttachmentsOption } from './attachments.js';

const ALLOWED_PLAY_OPTIONS_KEYS = new Set([
  'attachments',
  'temperature',
  'topP',
  'topK',
  'maxOutputTokens',
]);
const NUMERIC_PLAY_OPTION_KEYS = ['temperature', 'topP', 'topK'];

function validateNumericPlayOption(value, key, callOptions) {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError(`Kimten play(input, context, options) option "${key}" must be a number when provided.`);
  }

  if (key === 'topP' && (value < 0 || value > 1)) {
    throw new TypeError('Kimten play(input, context, options) option "topP" must be between 0 and 1.');
  }

  if (key === 'topK' && (!Number.isInteger(value) || value < 1)) {
    throw new TypeError('Kimten play(input, context, options) option "topK" must be an integer >= 1.');
  }

  callOptions[key] = value;
}

/**
 * @param {Record<string, unknown> | undefined | null} options
 * @returns {{
 *   attachments: Array<Record<string, unknown>>,
 *   callOptions: Record<string, number>
 * }}
 */
export function validatePlayOptions(options) {
  if (options === undefined || options === null) {
    return { attachments: [], callOptions: {} };
  }

  if (!isPlainObject(options)) {
    throw new TypeError('Kimten play(input, context, options) expects options to be a plain object when provided.');
  }

  for (const key of Object.keys(options)) {
    if (!ALLOWED_PLAY_OPTIONS_KEYS.has(key)) {
      throw new TypeError(
        `Kimten play(input, context, options) does not support option "${key}". Allowed options: attachments, temperature, topP, topK, maxOutputTokens.`
      );
    }
  }

  const callOptions = {};
  for (const key of NUMERIC_PLAY_OPTION_KEYS) {
    validateNumericPlayOption(options[key], key, callOptions);
  }

  if (options.maxOutputTokens !== undefined) {
    if (!Number.isInteger(options.maxOutputTokens) || options.maxOutputTokens < 1) {
      throw new TypeError(
        'Kimten play(input, context, options) option "maxOutputTokens" must be an integer >= 1 when provided.'
      );
    }
    callOptions.maxOutputTokens = options.maxOutputTokens;
  }

  return { attachments: normalizeAttachmentsOption(options.attachments), callOptions };
}
