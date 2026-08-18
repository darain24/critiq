#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createReviewServer } from './server.js';

const server = createReviewServer();
const transport = new StdioServerTransport();

server.connect(transport).catch((error: unknown) => {
  console.error('Review MCP server failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

export { createReviewServer } from './server.js';
