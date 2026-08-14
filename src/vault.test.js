import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TaskVault } from './vault.js';

describe('TaskVault Baseline', () => {
  test('should store and retrieve values', () => {
    const vault = new TaskVault();
    vault.set('session:1', { user: 'Alice', role: 'admin' });
    const result = vault.get('session:1');
    assert.deepEqual(result, { user: 'Alice', role: 'admin' });
  });

  test('should return null for non-existent keys', () => {
    const vault = new TaskVault();
    assert.equal(vault.get('unknown-key'), null);
    assert.equal(vault.has('unknown-key'), false);
  });

  test('should delete keys properly', () => {
    const vault = new TaskVault();
    vault.set('temp', 'value');
    assert.equal(vault.has('temp'), true);
    assert.equal(vault.delete('temp'), true);
    assert.equal(vault.has('temp'), false);
    assert.equal(vault.get('temp'), null);
  });

  test('should report accurate size and handle clear', () => {
    const vault = new TaskVault();
    vault.set('a', 1);
    vault.set('b', 2);
    assert.equal(vault.size(), 2);
    vault.clear();
    assert.equal(vault.size(), 0);
  });

  test('should throw error on invalid key', () => {
    const vault = new TaskVault();
    assert.throws(() => vault.set('', 'val'), /Key must be a non-empty string/);
  });
});

describe('TaskVault TTL Support', () => {
  test('should return false for isExpired on non-existent keys', () => {
    const vault = new TaskVault();
    assert.equal(vault.isExpired('nonexistent'), false);
  });

  test('should return false for isExpired on keys without TTL', () => {
    const vault = new TaskVault();
    vault.set('persistent', 'permanent-value');
    assert.equal(vault.isExpired('persistent'), false);
    assert.equal(vault.has('persistent'), true);
    assert.equal(vault.get('persistent'), 'permanent-value');
  });

  test('should not expire before ttlMs duration', () => {
    const vault = new TaskVault();
    vault.set('temp-key', 'active-val', { ttlMs: 1000 });
    assert.equal(vault.isExpired('temp-key'), false);
    assert.equal(vault.has('temp-key'), true);
    assert.equal(vault.get('temp-key'), 'active-val');
  });

  test('should expire after ttlMs and clean up on get() and has()', async () => {
    const vault = new TaskVault();
    vault.set('short-lived', 'temporary', { ttlMs: 20 });

    assert.equal(vault.has('short-lived'), true);
    assert.equal(vault.get('short-lived'), 'temporary');

    // Wait for TTL to pass
    await new Promise((resolve) => setTimeout(resolve, 35));

    assert.equal(vault.isExpired('short-lived'), true);
    assert.equal(vault.get('short-lived'), null);
    // After get(), it should have been deleted from the store
    assert.equal(vault.has('short-lived'), false);
    assert.equal(vault.size(), 0);
  });

  test('has() should return false and clean up expired entry', async () => {
    const vault = new TaskVault();
    vault.set('expire-check', 'val', { ttlMs: 20 });

    await new Promise((resolve) => setTimeout(resolve, 35));

    assert.equal(vault.has('expire-check'), false);
    assert.equal(vault.size(), 0);
  });

  test('should handle multiple keys with independent TTLs', async () => {
    const vault = new TaskVault();
    vault.set('quick', 'fast', { ttlMs: 20 });
    vault.set('slow', 'slow-val', { ttlMs: 200 });
    vault.set('forever', 'eternal');

    await new Promise((resolve) => setTimeout(resolve, 35));

    assert.equal(vault.get('quick'), null);
    assert.equal(vault.get('slow'), 'slow-val');
    assert.equal(vault.get('forever'), 'eternal');
  });

  test('should allow updating existing key with new TTL', async () => {
    const vault = new TaskVault();
    vault.set('key', 'val1', { ttlMs: 20 });
    // Overwrite before expiry with longer TTL
    vault.set('key', 'val2', { ttlMs: 200 });

    await new Promise((resolve) => setTimeout(resolve, 35));

    assert.equal(vault.isExpired('key'), false);
    assert.equal(vault.get('key'), 'val2');
  });
});

describe('TaskVault Tagging Support', () => {
  test('should default tags to empty array when omitted', () => {
    const vault = new TaskVault();
    vault.set('no-tags', 'value');
    assert.deepEqual(vault.getTags('no-tags'), []);
  });

  test('should store and retrieve tags via getTags', () => {
    const vault = new TaskVault();
    vault.set('doc:1', { title: 'Doc 1' }, { tags: ['work', 'urgent'] });
    assert.deepEqual(vault.getTags('doc:1'), ['work', 'urgent']);
  });

  test('should return empty array for getTags on non-existent or expired key', async () => {
    const vault = new TaskVault();
    assert.deepEqual(vault.getTags('nonexistent'), []);

    vault.set('expiring', 'temp', { tags: ['temp-tag'], ttlMs: 20 });
    assert.deepEqual(vault.getTags('expiring'), ['temp-tag']);

    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.deepEqual(vault.getTags('expiring'), []);
  });

  test('should find entries by a single tag using findByTag', () => {
    const vault = new TaskVault();
    vault.set('task:1', 'Buy milk', { tags: ['groceries', 'personal'] });
    vault.set('task:2', 'Fix bug', { tags: ['work', 'urgent'] });
    vault.set('task:3', 'File taxes', { tags: ['personal', 'finance'] });

    const personalTasks = vault.findByTag('personal');
    assert.equal(personalTasks.length, 2);
    assert.deepEqual(personalTasks, [
      { key: 'task:1', value: 'Buy milk' },
      { key: 'task:3', value: 'File taxes' },
    ]);

    const workTasks = vault.findByTag('work');
    assert.deepEqual(workTasks, [{ key: 'task:2', value: 'Fix bug' }]);

    const missing = vault.findByTag('missing');
    assert.deepEqual(missing, []);
  });

  test('should find entries matching all specified tags using findByAllTags', () => {
    const vault = new TaskVault();
    vault.set('doc:1', 'A', { tags: ['project-x', 'frontend', 'draft'] });
    vault.set('doc:2', 'B', { tags: ['project-x', 'backend'] });
    vault.set('doc:3', 'C', { tags: ['project-x', 'frontend', 'final'] });

    const frontendDocs = vault.findByAllTags(['project-x', 'frontend']);
    assert.deepEqual(frontendDocs, [
      { key: 'doc:1', value: 'A' },
      { key: 'doc:3', value: 'C' },
    ]);

    const draftFrontend = vault.findByAllTags(['project-x', 'frontend', 'draft']);
    assert.deepEqual(draftFrontend, [{ key: 'doc:1', value: 'A' }]);

    const noMatches = vault.findByAllTags(['project-x', 'unknown']);
    assert.deepEqual(noMatches, []);

    assert.deepEqual(vault.findByAllTags([]), []);
  });

  test('should exclude and purge expired entries from tag queries', async () => {
    const vault = new TaskVault();
    vault.set('active', 'stays', { tags: ['report'] });
    vault.set('expired', 'gone', { tags: ['report', 'temp'], ttlMs: 20 });

    assert.equal(vault.findByTag('report').length, 2);

    await new Promise((resolve) => setTimeout(resolve, 35));

    const results = vault.findByTag('report');
    assert.deepEqual(results, [{ key: 'active', value: 'stays' }]);

    const allTagResults = vault.findByAllTags(['report', 'temp']);
    assert.deepEqual(allTagResults, []);

    // Expired entry should be cleaned up
    assert.equal(vault.has('expired'), false);
  });
});

describe('TaskVault Audit Hash Chain', () => {
  test('should initialize with empty audit log and valid integrity', () => {
    const vault = new TaskVault();
    assert.deepEqual(vault.getAuditLog(), []);
    const integrity = vault.verifyIntegrity();
    assert.deepEqual(integrity, { valid: true, count: 0 });
  });

  test('should append valid audit blocks for SET, DELETE, and CLEAR mutations', () => {
    const vault = new TaskVault();
    vault.set('item:1', { title: 'First item' }, { tags: ['work'] });
    vault.delete('item:1');
    vault.clear();

    const log = vault.getAuditLog();
    assert.equal(log.length, 3);

    // Block 0: SET
    assert.equal(log[0].index, 0);
    assert.equal(typeof log[0].timestamp, 'number');
    assert.equal(log[0].action, 'SET');
    assert.equal(log[0].key, 'item:1');
    assert.equal(log[0].prevHash, '0'.repeat(64));
    assert.match(log[0].payloadHash, /^[0-9a-f]{64}$/);
    assert.match(log[0].hash, /^[0-9a-f]{64}$/);

    // Block 1: DELETE
    assert.equal(log[1].index, 1);
    assert.equal(log[1].action, 'DELETE');
    assert.equal(log[1].key, 'item:1');
    assert.equal(log[1].prevHash, log[0].hash);
    assert.match(log[1].hash, /^[0-9a-f]{64}$/);

    // Block 2: CLEAR
    assert.equal(log[2].index, 2);
    assert.equal(log[2].action, 'CLEAR');
    assert.equal(log[2].key, null);
    assert.equal(log[2].prevHash, log[1].hash);
    assert.match(log[2].hash, /^[0-9a-f]{64}$/);

    // Integrity check
    const integrity = vault.verifyIntegrity();
    assert.deepEqual(integrity, { valid: true, count: 3 });
  });

  test('should return a defensive copy from getAuditLog()', () => {
    const vault = new TaskVault();
    vault.set('k', 'v');
    const log = vault.getAuditLog();
    log[0].action = 'TAMPERED';

    // Original audit log remains untouched
    assert.equal(vault.getAuditLog()[0].action, 'SET');
    assert.equal(vault.verifyIntegrity().valid, true);
  });

  test('should detect corruption when a block action is modified', () => {
    const vault = new TaskVault();
    vault.set('k1', 'v1');
    vault.set('k2', 'v2');

    // Simulate tampering in internal audit log
    vault.auditLog[0].action = 'DELETE';
    const result = vault.verifyIntegrity();
    assert.equal(result.valid, false);
    assert.equal(result.corruptedIndex, 0);
    assert.match(result.error, /Hash mismatch at index 0/);
  });

  test('should detect corruption when a block key is modified', () => {
    const vault = new TaskVault();
    vault.set('k1', 'v1');
    vault.set('k2', 'v2');

    vault.auditLog[1].key = 'altered_key';
    const result = vault.verifyIntegrity();
    assert.equal(result.valid, false);
    assert.equal(result.corruptedIndex, 1);
    assert.match(result.error, /Hash mismatch at index 1/);
  });

  test('should detect corruption when a block payloadHash is modified', () => {
    const vault = new TaskVault();
    vault.set('k1', 'v1');

    vault.auditLog[0].payloadHash = 'f'.repeat(64);
    const result = vault.verifyIntegrity();
    assert.equal(result.valid, false);
    assert.equal(result.corruptedIndex, 0);
    assert.match(result.error, /Hash mismatch at index 0/);
  });

  test('should detect corruption when prevHash linkage is broken', () => {
    const vault = new TaskVault();
    vault.set('k1', 'v1');
    vault.set('k2', 'v2');

    vault.auditLog[1].prevHash = 'a'.repeat(64);
    const result = vault.verifyIntegrity();
    assert.equal(result.valid, false);
    assert.equal(result.corruptedIndex, 1);
    assert.match(result.error, /Invalid prevHash at index 1/);
  });

  test('should detect corruption when block hash itself is modified', () => {
    const vault = new TaskVault();
    vault.set('k1', 'v1');

    vault.auditLog[0].hash = '0'.repeat(64);
    const result = vault.verifyIntegrity();
    assert.equal(result.valid, false);
    assert.equal(result.corruptedIndex, 0);
    assert.match(result.error, /Hash mismatch at index 0/);
  });

  test('should detect corruption when block index is altered', () => {
    const vault = new TaskVault();
    vault.set('k1', 'v1');
    vault.set('k2', 'v2');

    vault.auditLog[1].index = 99;
    const result = vault.verifyIntegrity();
    assert.equal(result.valid, false);
    assert.equal(result.corruptedIndex, 1);
    assert.match(result.error, /Invalid index at position 1/);
  });

  test('should append DELETE audit block on lazy expired entry cleanup', async () => {
    const vault = new TaskVault();
    vault.set('temp', 'value', { ttlMs: 20 });
    assert.equal(vault.getAuditLog().length, 1);

    await new Promise((resolve) => setTimeout(resolve, 35));

    // Access expired key triggers deletion
    assert.equal(vault.get('temp'), null);

    const log = vault.getAuditLog();
    assert.equal(log.length, 2);
    assert.equal(log[1].action, 'DELETE');
    assert.equal(log[1].key, 'temp');

    const integrity = vault.verifyIntegrity();
    assert.deepEqual(integrity, { valid: true, count: 2 });
  });
});
