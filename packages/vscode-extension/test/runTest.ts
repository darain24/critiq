import * as path from 'node:path';

import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  await runTests({ extensionDevelopmentPath, extensionTestsPath, version: '1.95.0' });
}

main().catch((error: unknown) => {
  console.error('VS Code integration tests failed:', error);
  process.exit(1);
});
