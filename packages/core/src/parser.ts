import parseDiff from 'parse-diff';

import type { DiffHunk } from './types.js';

export function parseUnifiedDiff(diff: string): DiffHunk[] {
  const files = parseDiff(diff);
  const hunks: DiffHunk[] = [];

  for (const file of files) {
    if (file.deleted) continue;
    const filePath = normalisePath(file.to ?? file.from ?? 'unknown');

    for (const chunk of file.chunks) {
      const changedLines = chunk.changes
        .filter((change) => change.type === 'add')
        .map((change) => change.ln);

      if (changedLines.length === 0) continue;
      hunks.push({
        file: filePath,
        oldFile: file.from ? normalisePath(file.from) : undefined,
        oldStart: chunk.oldStart,
        oldLines: chunk.oldLines,
        newStart: chunk.newStart,
        newLines: chunk.newLines,
        content: chunk.content + '\n' + chunk.changes.map((change) => change.content).join('\n'),
        changedLines,
      });
    }
  }

  return hunks;
}

function normalisePath(file: string): string {
  return file.replace(/^(a|b)\//, '');
}
