import type { ReviewCategory, ReviewComment } from '@critiq/review-core';

export interface ReviewOctokit {
  rest: {
    pulls: {
      listReviewComments(input: {
        owner: string;
        repo: string;
        pull_number: number;
        per_page: number;
      }): Promise<{ data: ExistingInlineComment[] }>;
      createReviewComment(input: {
        owner: string;
        repo: string;
        pull_number: number;
        commit_id: string;
        path: string;
        line: number;
        side: 'RIGHT';
        body: string;
      }): Promise<unknown>;
      updateReviewComment(input: {
        owner: string;
        repo: string;
        comment_id: number;
        body: string;
      }): Promise<unknown>;
      deleteReviewComment(input: {
        owner: string;
        repo: string;
        comment_id: number;
      }): Promise<unknown>;
    };
    issues: {
      listComments(input: {
        owner: string;
        repo: string;
        issue_number: number;
        per_page: number;
      }): Promise<{ data: ExistingIssueComment[] }>;
      createComment(input: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }): Promise<unknown>;
      updateComment(input: {
        owner: string;
        repo: string;
        comment_id: number;
        body: string;
      }): Promise<unknown>;
      deleteComment(input: { owner: string; repo: string; comment_id: number }): Promise<unknown>;
    };
  };
}

interface ExistingInlineComment {
  id: number;
  path?: string | null;
  line?: number | null;
  body?: string;
}

interface ExistingIssueComment {
  id: number;
  body?: string;
}

export interface PullRequestTarget {
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
}

export async function postReview(
  octokit: ReviewOctokit,
  target: PullRequestTarget,
  comments: ReviewComment[],
  changedLines: Set<string>,
  warning: (message: string) => void,
): Promise<void> {
  const existingInline = (
    await octokit.rest.pulls.listReviewComments({
      owner: target.owner,
      repo: target.repo,
      pull_number: target.pullNumber,
      per_page: 100,
    })
  ).data;

  for (const comment of comments) {
    if (!changedLines.has(`${comment.file}:${comment.line}`)) {
      warning(
        `Skipping ${comment.file}:${comment.line}; the line is not part of the pull request diff.`,
      );
      continue;
    }
    try {
      const body = formatInlineComment(comment);
      const matches = existingInline.filter(
        (existing) =>
          existing.path === comment.file &&
          existing.line === comment.line &&
          existing.body?.startsWith(`**${comment.severity.toUpperCase()}**:`),
      );
      const [current, ...duplicates] = matches;
      if (current) {
        await octokit.rest.pulls.updateReviewComment({
          owner: target.owner,
          repo: target.repo,
          comment_id: current.id,
          body,
        });
        await Promise.all(
          duplicates.map((duplicate) =>
            octokit.rest.pulls.deleteReviewComment({
              owner: target.owner,
              repo: target.repo,
              comment_id: duplicate.id,
            }),
          ),
        );
      } else {
        await octokit.rest.pulls.createReviewComment({
          owner: target.owner,
          repo: target.repo,
          pull_number: target.pullNumber,
          commit_id: target.commitId,
          path: comment.file,
          line: comment.line,
          side: 'RIGHT',
          body,
        });
      }
    } catch (error) {
      warning(
        `GitHub rejected the inline comment at ${comment.file}:${comment.line}: ${errorMessage(error)}`,
      );
    }
  }

  const body = summaryBody(comments);
  const existingSummaries = (
    await octokit.rest.issues.listComments({
      owner: target.owner,
      repo: target.repo,
      issue_number: target.pullNumber,
      per_page: 100,
    })
  ).data.filter(
    (comment) =>
      comment.body?.includes('<!-- critiq-summary -->') ||
      comment.body?.startsWith('## AI Code Review'),
  );
  const [currentSummary, ...duplicateSummaries] = existingSummaries;
  if (currentSummary) {
    await octokit.rest.issues.updateComment({
      owner: target.owner,
      repo: target.repo,
      comment_id: currentSummary.id,
      body,
    });
    await Promise.all(
      duplicateSummaries.map((duplicate) =>
        octokit.rest.issues.deleteComment({
          owner: target.owner,
          repo: target.repo,
          comment_id: duplicate.id,
        }),
      ),
    );
  } else {
    await octokit.rest.issues.createComment({
      owner: target.owner,
      repo: target.repo,
      issue_number: target.pullNumber,
      body,
    });
  }
}

export function filterByMinimum(
  comments: ReviewComment[],
  minimum: ReviewCategory,
): ReviewComment[] {
  const ranks: Record<ReviewCategory, number> = { style: 0, performance: 1, bug: 2, security: 3 };
  return comments.filter((comment) => ranks[comment.severity] >= ranks[minimum]);
}

export function summaryBody(comments: ReviewComment[]): string {
  if (comments.length === 0) {
    return '<!-- critiq-summary -->\n## AI Code Review\n\n✅ No issues found in the changed lines.';
  }
  const counts: Record<ReviewCategory, number> = { bug: 0, security: 0, style: 0, performance: 0 };
  for (const comment of comments) counts[comment.severity] += 1;
  const rows = (Object.keys(counts) as ReviewCategory[])
    .map((severity) => `| ${severity} | ${counts[severity]} |`)
    .join('\n');
  return `<!-- critiq-summary -->\n## AI Code Review\n\nFound **${comments.length}** issue(s).\n\n| Severity | Count |\n| --- | ---: |\n${rows}`;
}

function formatInlineComment(comment: ReviewComment): string {
  const suggestion = comment.suggestion
    ? `\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``
    : '';
  return `**${comment.severity.toUpperCase()}**: ${comment.message}${suggestion}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
