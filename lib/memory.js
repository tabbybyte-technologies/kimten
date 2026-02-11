export const MEMORY_LIMIT = 10;

export function createMemory(limit = MEMORY_LIMIT) {
  const history = [];

  function add(message) {
    history.push(message);
    if (history.length > limit) {
      history.shift();
    }
  }

  function list() {
    return history.slice();
  }

  function clear() {
    history.length = 0;
  }

  return {
    add,
    list,
    clear,
  };
}
