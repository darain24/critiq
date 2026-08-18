import picomatch from 'picomatch';

import { DefaultReviewCache } from './cache.js';
import { loadReviewConfig } from './config.js';
import { reviewWithRepair } from './json.js';
import { parseUnifiedDiff } from './parser.js';
import { buildReviewPrompt } from './prompts.js';
import { createLLMClientFromEnv } from './providers.js';
import type { ReviewCategory, ReviewComment, ReviewOptions } from './types.js';

const severityRank: Record<ReviewCategory, number> = {
  style: 0,
  performance: 1,
  bug: 2,
  security: 3,
};

export async function reviewDiff(
  diff: string,
  options: ReviewOptions = {},
): Promise<ReviewComment[]> {
  if (!diff.trim()) return [];
  const cwd = options.cwd ?? process.cwd();
  const config = await loadReviewConfig(cwd);
  const categories = options.categories ?? config.enabledCategories;
  const cache = options.cache ?? new DefaultReviewCache(cwd);

  if (options.cacheKey) {
    const cached = await cache.get(options.cacheKey);
    if (cached) return cached;
  }

  const isIgnored = picomatch(config.ignorePaths, { dot: true });
  const hunks = parseUnifiedDiff(diff).filter((hunk) => !isIgnored(hunk.file));
  const total = hunks.length * categories.length;
  if (total === 0) return [];
  const client = options.client ?? createLLMClientFromEnv();
  const comments: ReviewComment[] = [];
  let completed = 0;

  for (const hunk of hunks) {
    for (const category of categories) {
      const prompt = buildReviewPrompt(category, hunk, options.language);
      const result = await reviewWithRepair(client, prompt);
      comments.push(
        ...result.filter(
          (comment) =>
            comment.file === hunk.file &&
            comment.severity === category &&
            hunk.changedLines.includes(comment.line) &&
            severityRank[comment.severity] >= severityRank[config.minSeverity],
        ),
      );
      completed += 1;
      options.onProgress?.({ completed, total, hunk, category });
    }
  }

  const unique = deduplicate(comments);
  if (options.cacheKey) await cache.set(options.cacheKey, unique);
  return unique;
}

function deduplicate(comments: ReviewComment[]): ReviewComment[] {
  const seen = new Set<string>();
  return comments.filter((comment) => {
    const key = `${comment.file}:${comment.line}:${comment.severity}:${comment.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
