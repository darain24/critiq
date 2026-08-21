import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

suite('AI Code Review extension', () => {
  test('registers all commands after activation', async () => {
    const extension = vscode.extensions.getExtension('darain24.ai-code-review-vscode');
    assert.ok(extension, 'extension should be installed in the development host');
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'codeReview.reviewCurrentFile',
      'codeReview.reviewSelection',
      'codeReview.reviewStagedChanges',
      'codeReview.setApiKey',
    ]) {
      assert.ok(commands.includes(command), `${command} should be registered`);
    }
  });
});
