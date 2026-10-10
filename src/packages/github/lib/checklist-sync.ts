/**
 * Checks off a child task checkbox `- [x] #<childNumber>` in markdown body text if present.
 * Supports both `- [ ]` and `* [ ]` bullet syntax, and `#10` or `/issues/10` references.
 * Returns { updated: boolean, body: string }.
 */
export function syncParentChecklistText(
  body: string,
  childNumber: number
): { updated: boolean; body: string } {
  if (!body) {
    return { updated: false, body };
  }

  const lines = body.split(/\r?\n/);
  let updated = false;
  const childRefRegex = new RegExp(`(?:#|/issues/)${childNumber}\\b`, 'i');

  const newLines = lines.map((line) => {
    const checkboxMatch = line.match(/^(\s*[-*]\s*\[)\s*(\]\s*.*)$/);
    if (checkboxMatch && childRefRegex.test(line)) {
      updated = true;
      return `${checkboxMatch[1]}x${checkboxMatch[2]}`;
    }
    return line;
  });

  if (updated) {
    return {
      updated: true,
      body: newLines.join('\n'),
    };
  }

  return {
    updated: false,
    body,
  };
}
