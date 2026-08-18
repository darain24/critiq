import { describe, expect, it, vi } from 'vitest';

import { postReview, summaryBody, type ReviewOctokit } from '../src/publish.js';

describe('GitHub review publishing', () => {
  it('constructs anchored inline and summary comment payloads', async () => {
    const createReviewComment = vi.fn().mockResolvedValue({});
    const createComment = vi.fn().mockResolvedValue({});
    const octokit = {
      rest: { pulls: { createReviewComment }, issues: { createComment } },
    } as unknown as ReviewOctokit;

    await postReview(
      octokit,
      { owner: 'acme', repo: 'widget', pullNumber: 42, commitId: 'abc123' },
      [
        {
          file: 'src/index.ts',
          line: 7,
          severity: 'bug',
          message: 'This branch is inverted.',
          suggestion: 'if (ready) {',
        },
      ],
      new Set(['src/index.ts:7']),
      vi.fn(),
    );

    expect(createReviewComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widget',
      pull_number: 42,
      commit_id: 'abc123',
      path: 'src/index.ts',
      line: 7,
      side: 'RIGHT',
      body: '**BUG**: This branch is inverted.\n\n```suggestion\nif (ready) {\n```',
    });
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 42, body: expect.stringContaining('| bug | 1 |') }),
    );
  });

  it('skips a comment that cannot be anchored and still posts a no-issues summary', async () => {
    const createReviewComment = vi.fn();
    const createComment = vi.fn().mockResolvedValue({});
    const warning = vi.fn();
    const octokit = {
      rest: { pulls: { createReviewComment }, issues: { createComment } },
    } as unknown as ReviewOctokit;
    await postReview(
      octokit,
      { owner: 'a', repo: 'b', pullNumber: 1, commitId: 'c' },
      [{ file: 'old.ts', line: 1, severity: 'style', message: 'Nit.' }],
      new Set(),
      warning,
    );
    expect(createReviewComment).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    expect(summaryBody([])).toContain('No issues found');
  });
});
