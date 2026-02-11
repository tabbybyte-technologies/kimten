export const MEMORY_LIMIT = 10;

/**
 * A single chat message stored in short-term memory.
 *
 * @typedef {object} MemoryMessage
 * @property {'system' | 'user' | 'assistant' | 'tool'} role
 * @property {any} content
 */

/**
 * Short-term FIFO memory store (sliding window).
 *
 * @typedef {object} MemoryStore
 * @property {(message: MemoryMessage) => void} add
 * @property {() => MemoryMessage[]} list
 * @property {() => void} clear
 */

/**
 * Create a short-term FIFO memory store.
 *
 * @param {number} [limit=MEMORY_LIMIT] Max number of messages to keep.
 * @returns {MemoryStore}
 */
export function createMemory(limit = MEMORY_LIMIT) {
  const history = [];

  /** @param {MemoryMessage} message */
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
