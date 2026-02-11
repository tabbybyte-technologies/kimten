export function buildMessages(personality, history) {
  return [
    { role: 'system', content: personality },
    ...history,
  ];
}
