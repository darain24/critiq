import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { reviewCommentsSchema, type ReviewCache, type ReviewComment } from './types.js';

export class MemoryCache implements ReviewCache {
  private readonly entries = new Map<string, ReviewComment[]>();

  async get(key: string): Promise<ReviewComment[] | undefined> {
    return this.entries.get(key);
  }

  async set(key: string, comments: ReviewComment[]): Promise<void> {
    this.entries.set(key, comments);
  }
}

export class FileSystemJsonCache implements ReviewCache {
  constructor(private readonly filePath: string) {}

  async get(key: string): Promise<ReviewComment[] | undefined> {
    const entries = await this.readEntries();
    const value = entries[key];
    return value ? reviewCommentsSchema.parse(value) : undefined;
  }

  async set(key: string, comments: ReviewComment[]): Promise<void> {
    const entries = await this.readEntries();
    entries[key] = comments;
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, JSON.stringify(entries, null, 2), 'utf8');
    await rename(tempPath, this.filePath);
  }

  private async readEntries(): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as Record<string, unknown>;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return {};
      throw new Error(`Unable to read review cache at ${this.filePath}: ${errorMessage(error)}`);
    }
  }
}

export class DefaultReviewCache implements ReviewCache {
  private readonly memory = new MemoryCache();
  private readonly disk: FileSystemJsonCache;

  constructor(cwd = process.cwd()) {
    this.disk = new FileSystemJsonCache(join(cwd, '.cache', 'critiq.json'));
  }

  async get(key: string): Promise<ReviewComment[] | undefined> {
    const inMemory = await this.memory.get(key);
    if (inMemory) return inMemory;
    const onDisk = await this.disk.get(key);
    if (onDisk) await this.memory.set(key, onDisk);
    return onDisk;
  }

  async set(key: string, comments: ReviewComment[]): Promise<void> {
    await Promise.all([this.memory.set(key, comments), this.disk.set(key, comments)]);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
