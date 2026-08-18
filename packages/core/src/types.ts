import { z } from 'zod';

export const reviewCategories = ['bug', 'security', 'style', 'performance'] as const;
export type ReviewCategory = (typeof reviewCategories)[number];

export const reviewCommentSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  severity: z.enum(reviewCategories),
  message: z.string().min(1),
  suggestion: z.string().min(1).optional(),
});

export const reviewCommentsSchema = z.array(reviewCommentSchema);
export type ReviewComment = z.infer<typeof reviewCommentSchema>;

export interface DiffHunk {
  file: string;
  oldFile?: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  changedLines: number[];
}

export interface ReviewLLMClient {
  review(prompt: string): Promise<string>;
}

export interface ReviewCache {
  get(key: string): Promise<ReviewComment[] | undefined>;
  set(key: string, comments: ReviewComment[]): Promise<void>;
}

export interface ReviewConfig {
  enabledCategories: ReviewCategory[];
  ignorePaths: string[];
  minSeverity: ReviewCategory;
}

export interface ReviewProgress {
  completed: number;
  total: number;
  hunk: DiffHunk;
  category: ReviewCategory;
}

export interface ReviewOptions {
  categories?: ReviewCategory[];
  language?: string;
  cacheKey?: string;
  cache?: ReviewCache;
  client?: ReviewLLMClient;
  cwd?: string;
  onProgress?: (progress: ReviewProgress) => void;
}
