import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'ai-review-vscode-'));
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      version: '1.95.0',
      launchArgs: [
        `--user-data-dir=${path.join(temporaryRoot, 'user-data')}`,
        `--extensions-dir=${path.join(temporaryRoot, 'extensions')}`,
      ],
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error('VS Code integration tests failed:', error);
  process.exit(1);
});
