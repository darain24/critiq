import type { ReviewCategory, ReviewComment } from '@yourscope/review-core';

export interface ReviewOctokit {
  rest: {
    pulls: {
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
    };
    issues: {
      createComment(input: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }): Promise<unknown>;
    };
  };
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
  for (const comment of comments) {
    if (!changedLines.has(`${comment.file}:${comment.line}`)) {
      warning(
        `Skipping ${comment.file}:${comment.line}; the line is not part of the pull request diff.`,
      );
      continue;
    }
    try {
      await octokit.rest.pulls.createReviewComment({
        owner: target.owner,
        repo: target.repo,
        pull_number: target.pullNumber,
        commit_id: target.commitId,
        path: comment.file,
        line: comment.line,
        side: 'RIGHT',
        body: formatInlineComment(comment),
      });
    } catch (error) {
      warning(
        `GitHub rejected the inline comment at ${comment.file}:${comment.line}: ${errorMessage(error)}`,
      );
    }
  }

  await octokit.rest.issues.createComment({
    owner: target.owner,
    repo: target.repo,
    issue_number: target.pullNumber,
    body: summaryBody(comments),
  });
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
    return '## AI Code Review\n\n✅ No issues found in the changed lines.';
  }
  const counts: Record<ReviewCategory, number> = { bug: 0, security: 0, style: 0, performance: 0 };
  for (const comment of comments) counts[comment.severity] += 1;
  const rows = (Object.keys(counts) as ReviewCategory[])
    .map((severity) => `| ${severity} | ${counts[severity]} |`)
    .join('\n');
  return `## AI Code Review\n\nFound **${comments.length}** issue(s).\n\n| Severity | Count |\n| --- | ---: |\n${rows}`;
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
