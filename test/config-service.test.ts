import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigService, DEFAULT_CONFIG } from '../src/services/config-service.js';

describe('ConfigService (3-Tier Configuration Resolution)', () => {
  let tempDir: string;
  let localConfigPath: string;
  let globalConfigPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-config-test-'));
    localConfigPath = path.join(tempDir, '.sandcastle', 'config.json');
    globalConfigPath = path.join(tempDir, 'global-sandcastle', 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return default configuration when no local or global config exists', () => {
    const configService = new ConfigService({ localConfigPath, globalConfigPath });
    const resolved = configService.resolve();

    expect(resolved.model).toBe(DEFAULT_CONFIG.model);
    expect(resolved.reasoningEffort).toBe(DEFAULT_CONFIG.reasoningEffort);
    expect(resolved.mode).toBe(DEFAULT_CONFIG.mode);
    expect(resolved.timeout).toBe(DEFAULT_CONFIG.timeout);
    expect(resolved.retries).toBe(DEFAULT_CONFIG.retries);
    expect(resolved.autoPr).toBe(true);
    expect(resolved.autoMerge).toBe(true);
    expect(resolved.parentLabels).toEqual(['parent', 'epic', 'wayfinder:map']);
    expect(resolved.hitlLabels).toEqual(['wayfinder:grilling', 'wayfinder:prototype']);
    expect(resolved.promptTemplate).toBe('');
  });

  it('should support configuring custom promptTemplate in local and global config', () => {
    fs.mkdirSync(path.dirname(localConfigPath), { recursive: true });
    fs.writeFileSync(
      localConfigPath,
      JSON.stringify({
        promptTemplate: '.sandcastle/custom-prompt.md',
      })
    );

    const configService = new ConfigService({ localConfigPath, globalConfigPath });
    const resolved = configService.resolve();

    expect(resolved.promptTemplate).toBe('.sandcastle/custom-prompt.md');
  });

  it('should support overriding parentLabels and hitlLabels in config', () => {
    fs.mkdirSync(path.dirname(localConfigPath), { recursive: true });
    fs.writeFileSync(
      localConfigPath,
      JSON.stringify({
        parentLabels: ['custom-parent', 'epic'],
        hitlLabels: ['custom-hitl'],
      })
    );

    const configService = new ConfigService({ localConfigPath, globalConfigPath });
    const resolved = configService.resolve();

    expect(resolved.parentLabels).toEqual(['custom-parent', 'epic']);
    expect(resolved.hitlLabels).toEqual(['custom-hitl']);
  });

  it('should merge global configuration over defaults', () => {
    fs.mkdirSync(path.dirname(globalConfigPath), { recursive: true });
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({ model: 'gemini-3.7-pro', retries: 5 })
    );

    const configService = new ConfigService({ localConfigPath, globalConfigPath });
    const resolved = configService.resolve();

    expect(resolved.model).toBe('gemini-3.7-pro');
    expect(resolved.retries).toBe(5);
    expect(resolved.mode).toBe('afk'); // from defaults
  });

  it('should prioritize local project configuration over global and defaults', () => {
    fs.mkdirSync(path.dirname(globalConfigPath), { recursive: true });
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({ model: 'gemini-3.7-pro', retries: 5 })
    );

    fs.mkdirSync(path.dirname(localConfigPath), { recursive: true });
    fs.writeFileSync(
      localConfigPath,
      JSON.stringify({ model: 'gemini-2.5-flash', mode: 'dry-run' })
    );

    const configService = new ConfigService({ localConfigPath, globalConfigPath });
    const resolved = configService.resolve();

    expect(resolved.model).toBe('gemini-2.5-flash'); // local overrides global
    expect(resolved.mode).toBe('dry-run'); // local overrides defaults
    expect(resolved.retries).toBe(5); // inherited from global
  });

  it('should prioritize CLI runtime options over all config files', () => {
    fs.mkdirSync(path.dirname(localConfigPath), { recursive: true });
    fs.writeFileSync(
      localConfigPath,
      JSON.stringify({ model: 'gemini-2.5-flash', mode: 'dry-run' })
    );

    const configService = new ConfigService({ localConfigPath, globalConfigPath });
    const resolved = configService.resolve({
      model: 'custom-model',
      mode: 'supervised',
    });

    expect(resolved.model).toBe('custom-model'); // CLI override
    expect(resolved.mode).toBe('supervised'); // CLI override
  });

  it('should set and get config values for local and global scopes', () => {
    const configService = new ConfigService({ localConfigPath, globalConfigPath });

    configService.set('model', 'gemini-3.7-flash', false);
    expect(configService.get('model')).toBe('gemini-3.7-flash');

    const localRaw = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
    expect(localRaw.model).toBe('gemini-3.7-flash');

    configService.set('reasoningEffort', 'low', true);
    const globalRaw = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
    expect(globalRaw.reasoningEffort).toBe('low');
  });

  it('should list all configurations across tiers', () => {
    fs.mkdirSync(path.dirname(localConfigPath), { recursive: true });
    fs.writeFileSync(localConfigPath, JSON.stringify({ model: 'local-model' }));

    const configService = new ConfigService({ localConfigPath, globalConfigPath });
    const list = configService.list();

    expect(list.resolved.model).toBe('local-model');
    expect(list.local.model).toBe('local-model');
    expect(list.defaults.model).toBe(DEFAULT_CONFIG.model);
  });
});
