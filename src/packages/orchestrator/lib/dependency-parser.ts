/**
 * Parser for issue dependencies, parent epic references, and acceptance criteria.
 */

/**
 * Extracts parent / epic issue numbers from issue markdown body.
 * Matches patterns like 'Part of #40', 'Parent: #41', 'Parent Issue: #42', 'Epic: #43'.
 */
export function parseParentReferences(body: string): number[] {
  if (!body || !body.trim()) {
    return [];
  }

  const parentNumbers = new Set<number>();
  const parentRegex = /(?:Part of|Parent(?: Issue)?|Epic)[:\s]+#(\d+)/gi;

  const matches = body.matchAll(parentRegex);
  for (const match of matches) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) {
      parentNumbers.add(num);
    }
  }

  return Array.from(parentNumbers);
}

/**
 * Extracts prerequisite / blocker issue numbers from issue markdown body.
 * Matches variations of 'Blocked by: #12', 'Depends on #13', 'Prerequisites: #14, #15', 'Requires: #16'.
 */
export function parsePrerequisites(body: string): number[] {
  if (!body || !body.trim()) {
    return [];
  }

  const prereqNumbers = new Set<number>();
  const lines = body.split(/\r?\n/);

  const blockerLineRegex =
    /^\s*(?:[-*#>]+\s*)?(?:blocked\s+by|depends\s+on|prerequisites?|requires?)\s*[:=-]?\s*(.*)$/i;

  for (const line of lines) {
    const match = line.match(blockerLineRegex);
    if (match && match[1]) {
      const remainingText = match[1].trim();
      if (!remainingText) continue;

      const numberMatches = remainingText.matchAll(/#(\d+)|\b(\d+)\b/g);
      for (const numMatch of numberMatches) {
        const rawNum = numMatch[1] ?? numMatch[2];
        const num = parseInt(rawNum, 10);
        if (!isNaN(num) && num > 0) {
          prereqNumbers.add(num);
        }
      }
    }
  }

  return Array.from(prereqNumbers);
}

/**
 * Parses markdown task list checkboxes into structured acceptance criteria.
 * Matches lines like '- [ ] criteria' or '- [x] criteria'.
 */
export function parseAcceptanceCriteria(
  body: string
): Array<{ text: string; done: boolean }> {
  if (!body) return [];
  const lines = body.split('\n');
  const criteria: Array<{ text: string; done: boolean }> = [];
  for (const line of lines) {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/);
    if (match) {
      criteria.push({
        text: match[2].trim(),
        done: match[1].toLowerCase() === 'x',
      });
    }
  }
  return criteria;
}
