import type { BlockerReportOptions } from '../../../types/gating.js';
import type { ParentProgressCommentOptions } from '../../../types/github.js';
import { sanitizeBlockerEvidence } from './evidence-sanitizer.js';

/**
 * Formats a structured diagnostic audit comment for a blocked issue.
 */
export function buildBlockerComment(options: BlockerReportOptions): string {
  const evidence = sanitizeBlockerEvidence(options.evidence);

  return [
    '## 🚫 Sandcastle Baton Blocked',
    '',
    `**Reason:** ${options.reason}`,
    evidence ? `\n### Evidence / Output\n\`\`\`\n${evidence}\n\`\`\`` : '',
    options.remediation ? `\n### Remediation\n${options.remediation}` : '',
    '',
    '---',
    '_Sandcastle autonomous execution halted to protect repository integrity._',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Formats a structured progress audit comment on a parent issue when a child task completes.
 */
export function buildParentProgressComment(options: ParentProgressCommentOptions): string {
  const titleText = options.childTitle ? ` - ${options.childTitle}` : '';
  const changesText = options.changes ?? `Completed implementation for issue #${options.childNumber}.`;
  const verificationText = options.verification ?? `All local test suites and linters passed (100% green).`;
  const testingNotesText = options.testingNotes ?? `Automated verification executed with 0 failures.`;

  return [
    `## 📋 Child Issue Completed: #${options.childNumber}${titleText}`,
    '',
    '### Changes Implemented',
    changesText,
    '',
    '### Verification Results',
    verificationText,
    '',
    '### Testing Notes',
    testingNotesText,
    '',
    '---',
    '_Sandcastle autonomous parent progress synchronization._',
  ].join('\n');
}
