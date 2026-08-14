import crypto from 'node:crypto';

/**
 * Core TaskVault: In-memory key-value store with baseline operations, TTL support, tag filtering, tamper-evident audit hash chain, and snapshot export/import.
 */
export class TaskVault {
  constructor() {
    this.store = new Map();
    this.auditLog = [];
  }

  /**
   * Internal helper to compute SHA-256 hash for an audit block.
   * @private
   * @param {object} block
   * @returns {string}
   */
  _calculateBlockHash(block) {
    const data = `${block.index}${block.timestamp}${block.action}${block.key}${block.payloadHash}${block.prevHash}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Internal helper to create and append an audit block to the chain.
   * @private
   * @param {'SET'|'DELETE'|'CLEAR'|'IMPORT'} action
   * @param {string|null} key
   * @param {any} payload
   * @returns {object}
   */
  _appendAuditBlock(action, key, payload) {
    const previousBlock = this.auditLog.length > 0 ? this.auditLog[this.auditLog.length - 1] : null;
    const index = this.auditLog.length;
    const timestamp = Date.now();
    const normalizedKey = key || null;
    const payloadStr = JSON.stringify(payload === undefined ? null : payload);
    const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');
    const prevHash = previousBlock ? previousBlock.hash : '0'.repeat(64);
    const block = {
      index,
      timestamp,
      action,
      key: normalizedKey,
      payloadHash,
      prevHash,
      hash: '',
    };
    block.hash = this._calculateBlockHash(block);
    this.auditLog.push(block);
    return block;
  }

  /**
   * Store a value under a key with optional settings such as TTL and tags.
   * @param {string} key
   * @param {any} value
   * @param {object} [options]
   * @param {number} [options.ttlMs] - Time-to-live in milliseconds.
   * @param {string[]} [options.tags] - Array of tag strings.
   * @returns {boolean}
   */
  set(key, value, options = {}) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('Key must be a non-empty string');
    }
    const tags = Array.isArray(options.tags) ? [...options.tags] : [];
    const entry = {
      value,
      tags,
      createdAt: Date.now(),
      options: { ...options, tags },
    };
    if (typeof options.ttlMs === 'number') {
      entry.expiresAt = Date.now() + options.ttlMs;
    }
    this.store.set(key, entry);
    this._appendAuditBlock('SET', key, { value, options: { ...options, tags } });
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
    const result = this.store.delete(key);
    this._appendAuditBlock('DELETE', key, null);
    return result;
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
    this._appendAuditBlock('CLEAR', null, null);
  }

  /**
   * Find entries containing a given tag.
   * Automatically purges/ignores expired entries.
   * @param {string} tag
   * @returns {Array<{ key: string, value: any }>}
   */
  findByTag(tag) {
    if (typeof tag !== 'string') return [];
    const results = [];
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (this.isExpired(key)) {
        this.delete(key);
        continue;
      }
      if (entry.tags && entry.tags.includes(tag)) {
        results.push({ key, value: entry.value });
      }
    }
    return results;
  }

  /**
   * Find entries containing all specified tags (logical AND).
   * Automatically purges/ignores expired entries.
   * @param {string[]} tags
   * @returns {Array<{ key: string, value: any }>}
   */
  findByAllTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }
    const results = [];
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (this.isExpired(key)) {
        this.delete(key);
        continue;
      }
      if (tags.every((t) => entry.tags && entry.tags.includes(t))) {
        results.push({ key, value: entry.value });
      }
    }
    return results;
  }

  /**
   * Get tags associated with a key.
   * Returns empty array if not found or expired.
   * @param {string} key
   * @returns {string[]}
   */
  getTags(key) {
    if (this.isExpired(key)) {
      this.delete(key);
      return [];
    }
    const entry = this.store.get(key);
    if (!entry) return [];
    return entry.tags ? [...entry.tags] : [];
  }

  /**
   * Get a copy of the audit log chain.
   * @returns {Array<object>}
   */
  getAuditLog() {
    return this.auditLog.map((block) => ({ ...block }));
  }

  /**
   * Verify the integrity of the audit log chain.
   * Traverses the entire audit log, recalculates hashes, and checks prevHash link consistency.
   * @param {Array<object>} [customLog] - Optional audit log array to verify instead of internal log.
   * @returns {{ valid: boolean, count?: number, error?: string, corruptedIndex?: number }}
   */
  verifyIntegrity(customLog = null) {
    const log = Array.isArray(customLog) ? customLog : this.auditLog;
    for (let i = 0; i < log.length; i++) {
      const block = log[i];

      if (!block || typeof block !== 'object') {
        return {
          valid: false,
          error: `Invalid block at position ${i}`,
          corruptedIndex: i,
        };
      }

      if (block.index !== i) {
        return {
          valid: false,
          error: `Invalid index at position ${i}: expected ${i}, got ${block.index}`,
          corruptedIndex: i,
        };
      }

      const expectedPrevHash = i === 0 ? '0'.repeat(64) : log[i - 1].hash;
      if (block.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          error: `Invalid prevHash at index ${i}: expected ${expectedPrevHash}, got ${block.prevHash}`,
          corruptedIndex: i,
        };
      }

      const calculatedHash = this._calculateBlockHash(block);
      if (block.hash !== calculatedHash) {
        return {
          valid: false,
          error: `Hash mismatch at index ${i}: expected ${calculatedHash}, got ${block.hash}`,
          corruptedIndex: i,
        };
      }
    }

    return { valid: true, count: log.length };
  }

  /**
   * Export the entire vault state (active entries, tags, audit chain) as a JSON snapshot with SHA-256 root checksum.
   * @returns {string} Serialized JSON snapshot string.
   */
  exportSnapshot() {
    const version = '1.0.0';
    const timestamp = Date.now();

    const entries = [];
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (this.isExpired(key)) {
        this.delete(key);
        continue;
      }
      const item = {
        key,
        value: entry.value,
        tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
      };
      if (typeof entry.expiresAt === 'number') {
        item.expiresAt = entry.expiresAt;
      }
      entries.push(item);
    }

    const auditLog = this.getAuditLog();
    const dataToHash = `${version}${JSON.stringify(entries)}${JSON.stringify(auditLog)}`;
    const checksum = crypto.createHash('sha256').update(dataToHash).digest('hex');

    const snapshot = {
      version,
      timestamp,
      entries,
      auditLog,
      checksum,
    };

    return JSON.stringify(snapshot);
  }

  /**
   * Restore the vault state from a serialized JSON snapshot, validating checksum and audit chain integrity.
   * @param {string} jsonString - The JSON snapshot string to import.
   * @returns {{ importedEntries: number, auditRecords: number }}
   */
  importSnapshot(jsonString) {
    if (typeof jsonString !== 'string') {
      throw new Error('Snapshot must be a valid JSON string');
    }

    let payload;
    try {
      payload = JSON.parse(jsonString);
    } catch {
      throw new Error('Invalid JSON snapshot format');
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.version !== 'string' ||
      typeof payload.timestamp !== 'number' ||
      !Array.isArray(payload.entries) ||
      !Array.isArray(payload.auditLog) ||
      typeof payload.checksum !== 'string'
    ) {
      throw new Error('Invalid snapshot structure: missing required fields');
    }

    // Checksum verification
    const dataToHash = `${payload.version}${JSON.stringify(payload.entries)}${JSON.stringify(payload.auditLog)}`;
    const expectedChecksum = crypto.createHash('sha256').update(dataToHash).digest('hex');
    if (payload.checksum !== expectedChecksum) {
      throw new Error(`Snapshot checksum mismatch: expected ${expectedChecksum}, got ${payload.checksum}`);
    }

    // Verify incoming audit log integrity
    const integrityResult = this.verifyIntegrity(payload.auditLog);
    if (!integrityResult.valid) {
      throw new Error(`Snapshot audit log integrity check failed: ${integrityResult.error}`);
    }

    // Restore internal store
    this.store.clear();
    let importedEntriesCount = 0;
    for (const entry of payload.entries) {
      if (!entry || typeof entry.key !== 'string') {
        continue;
      }
      if (typeof entry.expiresAt === 'number' && Date.now() > entry.expiresAt) {
        continue;
      }
      const tags = Array.isArray(entry.tags) ? [...entry.tags] : [];
      const storeEntry = {
        value: entry.value,
        tags,
        createdAt: Date.now(),
        options: { tags },
      };
      if (typeof entry.expiresAt === 'number') {
        storeEntry.expiresAt = entry.expiresAt;
        storeEntry.options.ttlMs = Math.max(0, entry.expiresAt - Date.now());
      }
      this.store.set(entry.key, storeEntry);
      importedEntriesCount++;
    }

    // Restore audit log
    const auditRecordsCount = payload.auditLog.length;
    this.auditLog = payload.auditLog.map((block) => ({ ...block }));

    // Append IMPORT action block to the chain
    this._appendAuditBlock('IMPORT', null, {
      importedEntries: importedEntriesCount,
      auditRecords: auditRecordsCount,
      checksum: payload.checksum,
      version: payload.version,
    });

    return {
      importedEntries: importedEntriesCount,
      auditRecords: auditRecordsCount,
    };
  }
}
