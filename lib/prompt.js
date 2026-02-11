/**
 * Build AI SDK messages for a generation call.
 *
 * @param {string} personality System prompt / instructions.
 * @param {Array<{ role: string, content: any }>} history Prior conversation messages.
 * @returns {Array<{ role: string, content: any }>}
 */
export function buildMessages(personality, history) {
  return [
    { role: 'system', content: personality },
    ...history,
  ];
}
