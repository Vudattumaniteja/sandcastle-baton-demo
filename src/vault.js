/**
 * Core TaskVault: In-memory key-value store with baseline operations and TTL support.
 */
export class TaskVault {
  constructor() {
    this.store = new Map();
  }

  /**
   * Store a value under a key with optional settings such as TTL.
   * @param {string} key
   * @param {any} value
   * @param {object} [options]
   * @param {number} [options.ttlMs] - Time-to-live in milliseconds.
   * @returns {boolean}
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
    if (typeof options.ttlMs === 'number') {
      entry.expiresAt = Date.now() + options.ttlMs;
    }
    this.store.set(key, entry);
    return true;
  }

  /**
   * Check if an entry has expired based on its TTL.
   * Returns true if key exists and Date.now() > entry.expiresAt.
   * Returns false if key exists and has not expired (or has no TTL).
   * Returns false if key does not exist.
   * @param {string} key
   * @returns {boolean}
   */
  isExpired(key) {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (typeof entry.expiresAt !== 'number') return false;
    return Date.now() > entry.expiresAt;
  }

  /**
   * Retrieve a value by key. Returns null if not found or expired.
   * If an entry exists but isExpired(key) is true, deletes the expired entry.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    if (this.isExpired(key)) {
      this.delete(key);
      return null;
    }
    const entry = this.store.get(key);
    if (!entry) return null;
    return entry.value;
  }

  /**
   * Check if a key exists and has not expired.
   * If expired, deletes the entry and returns false.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    if (this.isExpired(key)) {
      this.delete(key);
      return false;
    }
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
