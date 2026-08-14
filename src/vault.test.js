import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

describe('TaskVault Snapshot Export & Import', () => {
  test('should export snapshot with valid structure and root checksum', () => {
    const vault = new TaskVault();
    vault.set('key:1', { text: 'first' }, { tags: ['alpha'] });
    vault.set('key:2', 'second', { tags: ['beta', 'gamma'] });

    const snapshotJson = vault.exportSnapshot();
    assert.equal(typeof snapshotJson, 'string');

    const snapshot = JSON.parse(snapshotJson);
    assert.equal(snapshot.version, '1.0.0');
    assert.equal(typeof snapshot.timestamp, 'number');
    assert.equal(snapshot.entries.length, 2);
    assert.equal(snapshot.auditLog.length, 2);
    assert.match(snapshot.checksum, /^[0-9a-f]{64}$/);

    // Verify root checksum match
    const expectedData = `${snapshot.version}${JSON.stringify(snapshot.entries)}${JSON.stringify(snapshot.auditLog)}`;
    const expectedChecksum = crypto.createHash('sha256').update(expectedData).digest('hex');
    assert.equal(snapshot.checksum, expectedChecksum);
  });

  test('exportSnapshot should purge expired entries before export', async () => {
    const vault = new TaskVault();
    vault.set('active', 'stays', { tags: ['keep'] });
    vault.set('ephemeral', 'leaves', { tags: ['temp'], ttlMs: 20 });

    await new Promise((resolve) => setTimeout(resolve, 35));

    const snapshotJson = vault.exportSnapshot();
    const snapshot = JSON.parse(snapshotJson);

    assert.equal(snapshot.entries.length, 1);
    assert.equal(snapshot.entries[0].key, 'active');
    assert.equal(snapshot.entries[0].value, 'stays');
    assert.deepEqual(snapshot.entries[0].tags, ['keep']);

    // Ephemeral deletion was logged in auditLog before export
    assert.equal(vault.has('ephemeral'), false);
    const deleteBlock = snapshot.auditLog.find((b) => b.action === 'DELETE' && b.key === 'ephemeral');
    assert.ok(deleteBlock);
  });

  test('should export -> clear -> import roundtrip restoring entries, tags, and audit chain', () => {
    const vault = new TaskVault();
    vault.set('user:101', { name: 'Alice', role: 'admin' }, { tags: ['auth', 'admin'] });
    vault.set('config:timeout', 5000, { tags: ['settings'] });
    vault.delete('config:timeout');
    vault.set('doc:1', 'Important memo', { tags: ['docs'] });

    const snapshotJson = vault.exportSnapshot();

    // Clear the vault completely
    vault.clear();
    assert.equal(vault.size(), 0);

    // Restore from snapshot
    const result = vault.importSnapshot(snapshotJson);
    assert.equal(result.importedEntries, 2);
    assert.equal(result.auditRecords, 4);

    // Verify restored store entries
    assert.equal(vault.size(), 2);
    assert.deepEqual(vault.get('user:101'), { name: 'Alice', role: 'admin' });
    assert.deepEqual(vault.getTags('user:101'), ['auth', 'admin']);
    assert.equal(vault.get('doc:1'), 'Important memo');
    assert.deepEqual(vault.getTags('doc:1'), ['docs']);
    assert.equal(vault.get('config:timeout'), null);

    // Verify query operations work seamlessly on restored vault
    const authEntries = vault.findByTag('auth');
    assert.equal(authEntries.length, 1);
    assert.deepEqual(authEntries[0], { key: 'user:101', value: { name: 'Alice', role: 'admin' } });

    // Verify audit chain contains imported blocks + new IMPORT action block
    const fullLog = vault.getAuditLog();
    assert.equal(fullLog.length, 5); // 4 imported + 1 IMPORT block
    assert.equal(fullLog[4].action, 'IMPORT');
    assert.equal(fullLog[4].index, 4);
    assert.equal(fullLog[4].prevHash, fullLog[3].hash);

    // Chain integrity passes 100%
    const integrity = vault.verifyIntegrity();
    assert.deepEqual(integrity, { valid: true, count: 5 });
  });

  test('should reject invalid JSON input and missing required fields', () => {
    const vault = new TaskVault();

    assert.throws(() => vault.importSnapshot(null), /Snapshot must be a valid JSON string/);
    assert.throws(() => vault.importSnapshot('not-json'), /Invalid JSON snapshot format/);
    assert.throws(() => vault.importSnapshot('{}'), /Invalid snapshot structure: missing required fields/);
    assert.throws(
      () => vault.importSnapshot(JSON.stringify({ version: '1.0.0', entries: [] })),
      /Invalid snapshot structure: missing required fields/
    );
  });

  test('should reject snapshot with corrupted or altered checksum', () => {
    const vault = new TaskVault();
    vault.set('sec:1', 'confidential');
    const snapshotJson = vault.exportSnapshot();
    const snapshot = JSON.parse(snapshotJson);

    // Corrupt the checksum string
    snapshot.checksum = '0'.repeat(64);
    assert.throws(
      () => vault.importSnapshot(JSON.stringify(snapshot)),
      /Snapshot checksum mismatch/
    );

    // Tamper with entries without recalculating checksum
    const snapshot2 = JSON.parse(snapshotJson);
    snapshot2.entries.push({ key: 'injected', value: 'malicious', tags: [] });
    assert.throws(
      () => vault.importSnapshot(JSON.stringify(snapshot2)),
      /Snapshot checksum mismatch/
    );
  });

  test('should reject snapshot with tampered audit log chain', () => {
    const vault = new TaskVault();
    vault.set('k1', 'v1');
    vault.set('k2', 'v2');
    const snapshotJson = vault.exportSnapshot();
    const snapshot = JSON.parse(snapshotJson);

    // Tamper with audit log block
    snapshot.auditLog[0].action = 'DELETE';
    // Recompute root checksum so checksum validation passes, but audit log integrity fails
    const data = `${snapshot.version}${JSON.stringify(snapshot.entries)}${JSON.stringify(snapshot.auditLog)}`;
    snapshot.checksum = crypto.createHash('sha256').update(data).digest('hex');

    assert.throws(
      () => vault.importSnapshot(JSON.stringify(snapshot)),
      /Snapshot audit log integrity check failed/
    );
  });

  test('should support end-to-end workflow: TTL, Tagging, Audit Chain, and Snapshot restore into a fresh vault', async () => {
    const vault1 = new TaskVault();
    vault1.set('persist:1', { data: 123 }, { tags: ['critical', 'v1'] });
    vault1.set('persist:2', { data: 456 }, { tags: ['critical', 'v2'] });
    vault1.set('temp:1', { temp: true }, { tags: ['cache'], ttlMs: 300 });

    const exportedSnapshot = vault1.exportSnapshot();

    // Create a fresh new vault and import
    const vault2 = new TaskVault();
    const importRes = vault2.importSnapshot(exportedSnapshot);

    assert.equal(importRes.importedEntries, 3);
    assert.equal(importRes.auditRecords, 3);
    assert.equal(vault2.size(), 3);

    // Perform new operations on imported vault
    vault2.set('persist:3', { data: 789 }, { tags: ['critical', 'v3'] });
    vault2.delete('persist:1');

    const criticalItems = vault2.findByTag('critical');
    assert.equal(criticalItems.length, 2);
    assert.deepEqual(criticalItems, [
      { key: 'persist:2', value: { data: 456 } },
      { key: 'persist:3', value: { data: 789 } },
    ]);

    // Entire audit chain including import and subsequent mutations must be cryptographically valid
    const integrity = vault2.verifyIntegrity();
    assert.equal(integrity.valid, true);
    assert.equal(integrity.count, 6); // 3 original + 1 IMPORT + 1 SET + 1 DELETE
  });
});
