/**
 * Core TaskVault: In-memory key-value store with baseline operations.
 */
export class TaskVault {
  constructor() {
    this.store = new Map();
  }

  /**
   * Store a value under a key.
   * @param {string} key
   * @param {any} value
   * @param {object} [options]
   */
  set(key, value, options = {}) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('Key must be a non-empty string');
    }
    const entry = {
      value,
      createdAt: Date.now(),
      options: { ...options },
    };
    this.store.set(key, entry);
    return true;
  }

  /**
   * Retrieve a value by key. Returns null if not found.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    return entry.value;
  }

  /**
   * Check if a key exists.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.store.has(key);
  }

  /**
   * Remove an entry by key.
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Total number of entries.
   * @returns {number}
   */
  size() {
    return this.store.size;
  }

  /**
   * Clear all entries.
   */
  clear() {
    this.store.clear();
  }
}
