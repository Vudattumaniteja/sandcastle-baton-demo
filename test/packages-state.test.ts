import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RunStateStore,
  ConfigStore,
  DEFAULT_CONFIG,
  InMemoryRunStateStore,
  InMemoryConfigStore,
  writeAtomicSync,
  resolveStateFilePath,
  resolveLocalConfigPath,
  resolveGlobalConfigPath,
  mergeConfig,
  readJsonFileSync,
  writeJsonFileSync,
  type BatonRunSnapshot,
} from '#packages/state';

describe('packages/state', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-state-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('atomic-file & json-file', () => {
    it('should write atomically and read back JSON', () => {
      const target = path.join(tempDir, 'sub', 'test.json');
      writeAtomicSync(target, JSON.stringify({ hello: 'world' }));
      expect(fs.existsSync(target)).toBe(true);

      const parsed = readJsonFileSync<{ hello: string }>(target);
      expect(parsed).toEqual({ hello: 'world' });
    });

    it('should handle non-existent or malformed json safely', () => {
      const missing = path.join(tempDir, 'missing.json');
      expect(readJsonFileSync(missing)).toBeNull();

      const malformed = path.join(tempDir, 'malformed.json');
      fs.writeFileSync(malformed, '{ invalid json', 'utf-8');
      expect(readJsonFileSync(malformed)).toBeNull();
    });
  });

  describe('paths', () => {
    it('should resolve default and custom paths', () => {
      const stateDefault = resolveStateFilePath('/workspace');
      expect(stateDefault).toBe(path.join('/workspace', '.sandcastle', 'run.json'));

      const customState = resolveStateFilePath('/workspace', '/custom/run.json');
      expect(customState).toBe('/custom/run.json');

      const localDefault = resolveLocalConfigPath('/workspace');
      expect(localDefault).toBe(path.join('/workspace', '.sandcastle', 'config.json'));

      const globalPath = resolveGlobalConfigPath();
      expect(globalPath).toContain('.sandcastle');
    });
  });

  describe('config-merger', () => {
    it('should apply 3-tier precedence: CLI > local > global > defaults', () => {
      const merged = mergeConfig({
        defaults: DEFAULT_CONFIG,
        global: { model: 'gemini-global', retries: 5 },
        local: { model: 'gemini-local', mode: 'dry-run' },
        cli: { model: 'gemini-cli' },
      });

      expect(merged.model).toBe('gemini-cli');
      expect(merged.mode).toBe('dry-run');
      expect(merged.retries).toBe(5);
      expect(merged.timeout).toBe(DEFAULT_CONFIG.timeout);
    });
  });

  describe('RunStateStore', () => {
    it('should read, write, check existence, and clear snapshots', () => {
      const stateFilePath = path.join(tempDir, '.sandcastle', 'run.json');
      const store = new RunStateStore({ stateFilePath });

      expect(store.exists()).toBe(false);
      expect(store.read()).toBeNull();

      const snapshot: BatonRunSnapshot = {
        sessionId: 'session-123',
        startTime: new Date().toISOString(),
        status: 'running',
        repo: 'owner/repo',
        mode: 'afk',
        processedIssues: [],
        totalIssues: 3,
        closedCount: 0,
        blockedCount: 0,
        lastUpdated: new Date().toISOString(),
      };

      store.write(snapshot);
      expect(store.exists()).toBe(true);

      const loaded = store.get();
      expect(loaded?.sessionId).toBe('session-123');
      expect(loaded?.status).toBe('running');

      store.clear();
      expect(store.exists()).toBe(false);
      expect(store.read()).toBeNull();
    });
  });

  describe('InMemoryRunStateStore', () => {
    it('should operate purely in memory without disk access', () => {
      const memStore = new InMemoryRunStateStore();
      expect(memStore.exists()).toBe(false);
      expect(memStore.read()).toBeNull();

      const snapshot: BatonRunSnapshot = {
        sessionId: 'mem-session',
        startTime: '2026-10-09T00:00:00.000Z',
        status: 'completed',
        repo: 'owner/repo',
        mode: 'supervised',
        processedIssues: [],
        totalIssues: 1,
        closedCount: 1,
        blockedCount: 0,
        lastUpdated: '2026-10-09T00:05:00.000Z',
      };

      memStore.set(snapshot);
      expect(memStore.exists()).toBe(true);
      expect(memStore.get()?.sessionId).toBe('mem-session');

      memStore.clear();
      expect(memStore.exists()).toBe(false);
    });
  });

  describe('InMemoryConfigStore', () => {
    it('should resolve and update configurations in memory', () => {
      const memConfig = new InMemoryConfigStore({
        global: { model: 'global-model', retries: 3 },
        local: { mode: 'dry-run' },
      });

      expect(memConfig.get('model')).toBe('global-model');
      expect(memConfig.get('mode')).toBe('dry-run');

      memConfig.set('model', 'override-model', false);
      expect(memConfig.get('model')).toBe('override-model');

      const list = memConfig.list();
      expect(list.resolved.model).toBe('override-model');
      expect(list.resolved.mode).toBe('dry-run');
    });
  });
});
