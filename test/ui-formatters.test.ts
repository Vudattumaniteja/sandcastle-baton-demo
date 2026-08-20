import { describe, it, expect } from 'vitest';
import {
  formatGatingBadge,
  formatIssueOption,
  formatModelOption,
  getReasoningEffortChoices,
  getExecutionModeChoices,
  formatLaunchManifest,
  formatPhaseMessage,
} from '../src/ui/formatters.js';
import type { GatingEvaluation } from '../src/types/gating.js';
import type { ModelInfo, StatuslineSnapshot } from '../src/types/antigravity.js';

describe('UI Formatters & Badges (Variant A TUI Flow)', () => {
  describe('formatGatingBadge', () => {
    it('should return color-coded badge for READY status', () => {
      const badge = formatGatingBadge('READY');
      expect(badge).toContain('[READY]');
    });

    it('should return color-coded badge for WAITING status', () => {
      const badge = formatGatingBadge('WAITING');
      expect(badge).toContain('[WAITING]');
    });

    it('should return color-coded badge for BLOCKED status', () => {
      const badge = formatGatingBadge('BLOCKED');
      expect(badge).toContain('[BLOCKED]');
    });

    it('should return badge for UNGATED status', () => {
      const badge = formatGatingBadge('UNGATED');
      expect(badge).toContain('[UNGATED]');
    });

    it('should return badge for CLOSED status', () => {
      const badge = formatGatingBadge('CLOSED');
      expect(badge).toContain('[CLOSED]');
    });

    it('should return badge for PARENT status', () => {
      const badge = formatGatingBadge('PARENT');
      expect(badge).toContain('[PARENT]');
    });

    it('should return badge for HITL status', () => {
      const badge = formatGatingBadge('HITL');
      expect(badge).toContain('[HITL]');
    });
  });

  describe('formatIssueOption', () => {
    it('should format READY issue with green badge and ready hint', () => {
      const evaluation: GatingEvaluation = {
        issueNumber: 26,
        title: 'Interactive Guided Wizard',
        state: 'OPEN',
        status: 'READY',
        isReady: true,
        hasReadyLabel: true,
        hasAfkLabel: true,
        isBlockedLabelPresent: false,
        missingLabels: [],
        prerequisiteIssueNumbers: [],
        blockingIssueNumbers: [],
        reasons: ['All gate conditions satisfied.'],
      };

      const option = formatIssueOption(evaluation);
      expect(option.value).toBe(26);
      expect(option.label).toContain('#26');
      expect(option.label).toContain('Interactive Guided Wizard');
      expect(option.label).toContain('[READY]');
      expect(option.hint).toBeDefined();
    });

    it('should format WAITING issue with prerequisite hint', () => {
      const evaluation: GatingEvaluation = {
        issueNumber: 27,
        title: 'Terminal Watch Monitor',
        state: 'OPEN',
        status: 'WAITING',
        isReady: false,
        hasReadyLabel: true,
        hasAfkLabel: true,
        isBlockedLabelPresent: false,
        missingLabels: [],
        prerequisiteIssueNumbers: [26],
        blockingIssueNumbers: [26],
        reasons: ['Waiting for prerequisite issues to close: #26'],
      };

      const option = formatIssueOption(evaluation);
      expect(option.value).toBe(27);
      expect(option.label).toContain('[WAITING]');
      expect(option.hint).toContain('Waiting on #26');
    });

    it('should format UNGATED issue with missing labels hint', () => {
      const evaluation: GatingEvaluation = {
        issueNumber: 12,
        title: 'Fix typo',
        state: 'OPEN',
        status: 'UNGATED',
        isReady: false,
        hasReadyLabel: false,
        hasAfkLabel: false,
        isBlockedLabelPresent: false,
        missingLabels: ['ready-for-agent', 'AFK'],
        prerequisiteIssueNumbers: [],
        blockingIssueNumbers: [],
        reasons: ['Missing required gate labels: ready-for-agent, AFK'],
      };

      const option = formatIssueOption(evaluation);
      expect(option.value).toBe(12);
      expect(option.label).toContain('[UNGATED]');
      expect(option.hint).toContain('Missing ready-for-agent, AFK');
    });

    it('should format PARENT issue with parent badge and hint', () => {
      const evaluation: GatingEvaluation = {
        issueNumber: 40,
        title: 'Epic: Navigation Architecture',
        state: 'OPEN',
        status: 'PARENT',
        isReady: false,
        hasReadyLabel: false,
        hasAfkLabel: false,
        isBlockedLabelPresent: false,
        missingLabels: [],
        prerequisiteIssueNumbers: [],
        blockingIssueNumbers: [],
        reasons: ['Issue is classified as a parent/epic specification.'],
      };

      const option = formatIssueOption(evaluation);
      expect(option.value).toBe(40);
      expect(option.label).toContain('[PARENT]');
      expect(option.hint).toContain('Parent/epic');
    });

    it('should format HITL issue with HITL badge and hint', () => {
      const evaluation: GatingEvaluation = {
        issueNumber: 41,
        title: 'Grilling: Interview',
        state: 'OPEN',
        status: 'HITL',
        isReady: false,
        hasReadyLabel: false,
        hasAfkLabel: false,
        isBlockedLabelPresent: false,
        missingLabels: [],
        prerequisiteIssueNumbers: [],
        blockingIssueNumbers: [],
        reasons: ['Issue requires human-in-the-loop interaction.'],
      };

      const option = formatIssueOption(evaluation);
      expect(option.value).toBe(41);
      expect(option.label).toContain('[HITL]');
      expect(option.hint).toContain('Human-in-the-loop');
    });
  });

  describe('formatModelOption', () => {
    it('should format model with default badge', () => {
      const model: ModelInfo = {
        id: 'Gemini 3.7 Flash (High)',
        name: 'Gemini 3.7 Flash (High)',
        isDefault: true,
      };

      const option = formatModelOption(model, null);
      expect(option.value).toBe('Gemini 3.7 Flash (High)');
      expect(option.label).toContain('Gemini 3.7 Flash (High)');
      expect(option.label).toContain('[Default]');
    });

    it('should format model with live quota percentage and reset countdown', () => {
      const model: ModelInfo = {
        id: 'gemini-3.7-pro',
        name: 'gemini-3.7-pro',
        isDefault: false,
      };

      const snapshot: StatuslineSnapshot = {
        quota: {
          'gemini-3.7-pro': {
            remaining_fraction: 0.75,
            reset_in_seconds: 720,
          },
        },
      };

      const option = formatModelOption(model, snapshot);
      expect(option.value).toBe('gemini-3.7-pro');
      expect(option.label).toContain('75% quota');
      expect(option.hint).toContain('Resets in 12m');
    });

    it('should match pooled quota like gemini-5h for Gemini models without exact model id key', () => {
      const model: ModelInfo = {
        id: 'Gemini 3.7 Flash (High)',
        name: 'Gemini 3.7 Flash (High)',
        isDefault: true,
      };

      const snapshot: StatuslineSnapshot = {
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.65,
            reset_in_seconds: 8880,
          },
        },
      };

      const option = formatModelOption(model, snapshot);
      expect(option.value).toBe('Gemini 3.7 Flash (High)');
      expect(option.label).toContain('65% quota');
      expect(option.hint).toContain('Resets in 148m');
    });
  });

  describe('getReasoningEffortChoices', () => {
    it('should return high, medium, and low options with High recommended for AFK', () => {
      const choices = getReasoningEffortChoices();
      expect(choices).toHaveLength(3);
      expect(choices[0].value).toBe('high');
      expect(choices[0].label).toContain('High [Recommended for AFK Coding]');
      expect(choices[1].value).toBe('medium');
      expect(choices[2].value).toBe('low');
    });
  });

  describe('getExecutionModeChoices', () => {
    it('should return afk, supervised, and dry-run choices', () => {
      const choices = getExecutionModeChoices();
      expect(choices).toHaveLength(3);
      expect(choices[0].value).toBe('afk');
      expect(choices[0].label).toContain('Autonomous AFK');
      expect(choices[1].value).toBe('supervised');
      expect(choices[1].label).toContain('Supervised');
      expect(choices[2].value).toBe('dry-run');
      expect(choices[2].label).toContain('Dry Run');
    });
  });

  describe('formatLaunchManifest', () => {
    it('should format structured summary note card', () => {
      const manifest = {
        repo: 'owner/repo',
        branch: 'main',
        targetDescription: 'Issue #26: Interactive Guided Wizard',
        model: 'Gemini 3.7 Flash (High)',
        reasoningEffort: 'high' as const,
        mode: 'afk' as const,
        autoPr: true,
        autoMerge: true,
      };

      const summary = formatLaunchManifest(manifest);
      expect(summary).toContain('Repository:');
      expect(summary).toContain('owner/repo');
      expect(summary).toContain('Active Branch:');
      expect(summary).toContain('main');
      expect(summary).toContain('Target:');
      expect(summary).toContain('Issue #26');
      expect(summary).toContain('Model:');
      expect(summary).toContain('Gemini 3.7 Flash (High)');
      expect(summary).toContain('Reasoning:');
      expect(summary).toContain('High');
      expect(summary).toContain('Mode:');
      expect(summary).toContain('Autonomous AFK');
    });
  });

  describe('formatPhaseMessage', () => {
    it('should format messages across all 6 Worker Contract phases', () => {
      expect(formatPhaseMessage('inspect', 26)).toContain('[1/6 Inspecting]');
      expect(formatPhaseMessage('implement', 26)).toContain('[2/6 Implementing]');
      expect(formatPhaseMessage('test', 26)).toContain('[3/6 Testing]');
      expect(formatPhaseMessage('commit', 26)).toContain('[4/6 Git]');
      expect(formatPhaseMessage('pr', 26)).toContain('[5/6 PR]');
      expect(formatPhaseMessage('merge', 26)).toContain('[6/6 Merging]');
      expect(formatPhaseMessage('close', 26)).toContain('Closing');
    });
  });
});
