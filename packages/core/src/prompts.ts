import type { DiffHunk, ReviewCategory } from './types.js';

const categoryInstructions: Record<ReviewCategory, string> = {
  bug: 'Find concrete correctness defects, edge cases, and runtime failures. Do not report speculation.',
  security:
    'Find exploitable security weaknesses such as injection, broken authorization, secret exposure, or unsafe parsing.',
  style:
    'Find meaningful maintainability or readability problems. Avoid subjective preferences and trivial formatting.',
  performance:
    'Find material performance problems such as repeated I/O, N+1 queries, unbounded work, or needless large allocations.',
};

export function buildReviewPrompt(
  category: ReviewCategory,
  hunk: DiffHunk,
  language = 'unknown',
): string {
  return `You are a precise code reviewer. ${categoryInstructions[category]}

Review only added lines in this unified diff hunk. Report only ${category} findings. The file is ${hunk.file} and the language is ${language}. Valid added line numbers are: ${hunk.changedLines.join(', ')}.

Return strict JSON only: a JSON array where every item exactly matches:
{"file":"string","line":1,"severity":"${category}","message":"specific explanation","suggestion":"optional exact replacement text"}

Use the exact file path and an added line number shown above. Return [] when there is no real issue. Do not use markdown fences or prose.

DIFF HUNK:
${hunk.content}`;
}
