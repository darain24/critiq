import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { reviewCategories, type ReviewConfig } from './types.js';

const configSchema = z.object({
  enabledCategories: z.array(z.enum(reviewCategories)).default([...reviewCategories]),
  ignorePaths: z.array(z.string()).default(['dist/**', '*.lock']),
  minSeverity: z.enum(reviewCategories).default('style'),
});

export const defaultReviewConfig: ReviewConfig = configSchema.parse({});

export async function loadReviewConfig(cwd = process.cwd()): Promise<ReviewConfig> {
  const path = join(cwd, '.reviewconfig.json');
  try {
    return configSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return { ...defaultReviewConfig };
    throw new Error(`Unable to load ${path}: ${errorMessage(error)}`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
