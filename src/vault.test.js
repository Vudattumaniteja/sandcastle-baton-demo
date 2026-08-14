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
