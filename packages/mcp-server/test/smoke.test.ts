import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('review MCP server over stdio', () => {
  it('lists exactly review_code and returns valid JSON for a fixture diff', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(packageDirectory, 'dist/index.js')],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'smoke-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(['review_code']);
      const diff = await readFile(
        join(packageDirectory, 'test/fixtures/deletion-only.diff'),
        'utf8',
      );
      const result = await client.callTool({ name: 'review_code', arguments: { diff } });
      expect(result.isError).not.toBe(true);
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(content[0]?.type).toBe('text');
      expect(JSON.parse(content[0]?.text ?? '')).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
