import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  FallbackLLMClient,
  ProviderError,
  parseUnifiedDiff,
  reviewDiff,
  type ReviewLLMClient,
} from '../src/index.js';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function fixture(name: string): Promise<string> {
  return readFile(join(fixtureDirectory, name), 'utf8');
}

class FixtureClient implements ReviewLLMClient {
  async review(prompt: string): Promise<string> {
    const file = /The file is ([^ ]+)/.exec(prompt)?.[1] ?? 'unknown';
    const line = Number(/Valid added line numbers are: (\d+)/.exec(prompt)?.[1] ?? 1);
    if (file.endsWith('math.ts') && prompt.includes('only bug')) {
      return JSON.stringify([{ file, line, severity: 'bug', message: 'Uses the wrong divisor.' }]);
    }
    if (file.endsWith('users.ts') && prompt.includes('only security')) {
      return JSON.stringify([{ file, line, severity: 'security', message: 'SQL injection.' }]);
    }
    if (file.endsWith('report.ts') && prompt.includes('only style')) {
      return JSON.stringify([{ file, line, severity: 'style', message: 'Name is unclear.' }]);
    }
    if (file.endsWith('orders.ts') && prompt.includes('only performance')) {
      return JSON.stringify([{ file, line, severity: 'performance', message: 'N+1 queries.' }]);
    }
    return '[]';
  }
}

describe('reviewDiff fixtures', () => {
  it.each([
    ['bug.diff', 'bug'],
    ['sql-injection.diff', 'security'],
    ['style.diff', 'style'],
    ['performance.diff', 'performance'],
  ] as const)('finds the expected %s issue', async (name, severity) => {
    const comments = await reviewDiff(await fixture(name), {
      client: new FixtureClient(),
      categories: [severity],
    });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.severity).toBe(severity);
  });

  it('returns no comments for a clean diff', async () => {
    expect(
      await reviewDiff(await fixture('clean.diff'), {
        client: new FixtureClient(),
        categories: ['bug', 'security', 'style', 'performance'],
      }),
    ).toEqual([]);
  });

  it('retries once when the model returns malformed JSON', async () => {
    const client = { review: vi.fn().mockResolvedValueOnce('not json').mockResolvedValueOnce('[]') };
    await expect(
      reviewDiff(await fixture('malformed.diff'), { client, categories: ['bug'] }),
    ).resolves.toEqual([]);
    expect(client.review).toHaveBeenCalledTimes(2);
    expect(client.review.mock.calls[1]?.[0]).toContain('last response was invalid JSON');
  });
});

describe('diff parsing and provider fallback', () => {
  it('keeps normalized file paths and added line numbers', async () => {
    const hunks = parseUnifiedDiff(await fixture('sql-injection.diff'));
    expect(hunks[0]).toMatchObject({ file: 'src/users.ts', changedLines: [2, 3] });
  });

  it('falls back after rate limiting', async () => {
    const first = {
      review: vi.fn().mockRejectedValue(new ProviderError('Groq', 'HTTP 429', true, 429)),
    };
    const second = { review: vi.fn().mockResolvedValue('[]') };
    const client = new FallbackLLMClient(
      [
        { name: 'Groq', client: first },
        { name: 'Gemini', client: second },
      ],
      { warn: vi.fn() },
    );
    await expect(client.review('test')).resolves.toBe('[]');
    expect(second.review).toHaveBeenCalledOnce();
  });
});
