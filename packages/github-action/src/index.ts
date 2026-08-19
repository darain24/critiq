import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  parseUnifiedDiff,
  reviewCategories,
  reviewDiff,
  type ReviewCategory,
} from '@critiq/review-core';

import { filterByMinimum, postReview, type ReviewOctokit } from './publish.js';

export async function run(): Promise<void> {
  try {
    if (github.context.eventName !== 'pull_request' || !github.context.payload.pull_request) {
      core.info('AI Code Review only runs for pull_request events; nothing to do.');
      return;
    }

    const keys = {
      GROQ_API_KEY: core.getInput('groq-api-key'),
      CEREBRAS_API_KEY: core.getInput('cerebras-api-key'),
      GEMINI_API_KEY: core.getInput('gemini-api-key'),
    };
    if (!keys.GROQ_API_KEY && !keys.CEREBRAS_API_KEY && !keys.GEMINI_API_KEY) {
      core.setFailed(
        'No LLM API key was provided. Add GROQ_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY as a repository secret and pass it to this action.',
      );
      return;
    }
    for (const [name, value] of Object.entries(keys)) {
      if (value) {
        core.setSecret(value);
        process.env[name] = value;
      }
    }

    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    const pullRequest = github.context.payload.pull_request;
    const { owner, repo } = github.context.repo;
    const pullNumber = pullRequest.number;
    core.info(`Fetching diff for ${owner}/${repo}#${pullNumber}.`);
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      mediaType: { format: 'diff' },
    });
    const diff = response.data as unknown as string;
    if (typeof diff !== 'string')
      throw new Error('GitHub returned an unexpected non-text diff response.');

    const comments = await reviewDiff(diff, {
      categories: [...reviewCategories],
      cacheKey: `${pullRequest.head.sha}:${hashText(diff)}`,
    });
    const minimum = parseMinimum(core.getInput('min-severity') || 'style');
    const filtered = filterByMinimum(comments, minimum);
    const changedLines = new Set(
      parseUnifiedDiff(diff).flatMap((hunk) =>
        hunk.changedLines.map((line) => `${hunk.file}:${line}`),
      ),
    );
    await postReview(
      octokit as unknown as ReviewOctokit,
      { owner, repo, pullNumber, commitId: pullRequest.head.sha },
      filtered,
      changedLines,
      core.warning,
    );
    core.info(`AI Code Review completed with ${filtered.length} reportable issue(s).`);
  } catch (error) {
    core.setFailed(`AI Code Review failed: ${errorMessage(error)}`);
  }
}

function parseMinimum(value: string): ReviewCategory {
  if (!reviewCategories.includes(value as ReviewCategory)) {
    throw new Error(`Invalid min-severity "${value}". Use ${reviewCategories.join(', ')}.`);
  }
  return value as ReviewCategory;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void run();
