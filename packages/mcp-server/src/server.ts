import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  reviewCategories,
  reviewDiff,
  type ReviewCategory,
  type ReviewComment,
  type ReviewOptions,
} from '@yourscope/review-core';
import { z } from 'zod';

const reviewCodeInput = z.object({
  diff: z.string(),
  language: z.string().optional(),
  categories: z.array(z.enum(reviewCategories)).optional(),
});

type ReviewFunction = (diff: string, options?: ReviewOptions) => Promise<ReviewComment[]>;

export function createReviewServer(review: ReviewFunction = reviewDiff): Server {
  const server = new Server(
    { name: '@yourscope/review-mcp-server', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'review_code',
        description: 'Review a unified diff for bugs, security, style, and performance issues.',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['diff'],
          properties: {
            diff: { type: 'string', description: 'A unified diff to review.' },
            language: { type: 'string', description: 'Optional source language hint.' },
            categories: {
              type: 'array',
              items: { type: 'string', enum: [...reviewCategories] },
              description: 'Optional subset of review categories.',
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ServerResult> => {
    if (request.params.name !== 'review_code') {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    const parsed = reviewCodeInput.safeParse(request.params.arguments);
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid review_code input: ${parsed.error.message}` }],
        isError: true,
      };
    }
    try {
      const comments = await review(parsed.data.diff, {
        language: parsed.data.language,
        categories: parsed.data.categories as ReviewCategory[] | undefined,
      });
      return { content: [{ type: 'text', text: JSON.stringify(comments, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Code review failed: ${errorMessage(error)}` }],
        isError: true,
      };
    }
  });

  return server;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
