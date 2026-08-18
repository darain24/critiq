import * as path from 'node:path';

import {
  createLLMClientFromEnv,
  reviewCategories,
  reviewDiff,
  type ReviewCategory,
  type ReviewComment,
} from '@yourscope/review-core';
import * as vscode from 'vscode';

const secretNames = {
  groq: 'codeReview.groqApiKey',
  cerebras: 'codeReview.cerebrasApiKey',
  gemini: 'codeReview.geminiApiKey',
} as const;
type Provider = keyof typeof secretNames;

interface GitRepository {
  rootUri: vscode.Uri;
  diffIndexWithHEAD(): Promise<string>;
}
interface GitApi {
  repositories: GitRepository[];
}
interface GitExtension {
  getAPI(version: 1): GitApi;
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('codeReview');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.name = 'AI Code Review';

  context.subscriptions.push(
    diagnostics,
    status,
    vscode.commands.registerCommand('codeReview.setApiKey', () => setApiKey(context)),
    vscode.commands.registerCommand('codeReview.reviewCurrentFile', async () => {
      const editor = requireEditor();
      if (!editor) return;
      const document = editor.document;
      await runReview(
        context,
        diagnostics,
        status,
        fullDocumentDiff(document),
        document.languageId,
      );
    }),
    vscode.commands.registerCommand('codeReview.reviewSelection', async () => {
      const editor = requireEditor();
      if (!editor) return;
      if (editor.selection.isEmpty) {
        void vscode.window.showWarningMessage(
          'Select code before running AI Code Review: Review Selection.',
        );
        return;
      }
      await runReview(
        context,
        diagnostics,
        status,
        selectionDiff(editor.document, editor.selection),
        editor.document.languageId,
      );
    }),
    vscode.commands.registerCommand('codeReview.reviewStagedChanges', async () => {
      const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!extension) {
        void vscode.window.showErrorMessage('The built-in Git extension is unavailable.');
        return;
      }
      const git = extension.isActive ? extension.exports : await extension.activate();
      const api = git.getAPI(1);
      const repository = chooseRepository(api.repositories);
      if (!repository) {
        void vscode.window.showWarningMessage(
          'Open a Git repository before reviewing staged changes.',
        );
        return;
      }
      const diff = await repository.diffIndexWithHEAD();
      if (!diff.trim()) {
        void vscode.window.showInformationMessage('There are no staged changes to review.');
        return;
      }
      await runReview(context, diagnostics, status, diff);
    }),
  );
}

export function deactivate(): void {}

async function runReview(
  context: vscode.ExtensionContext,
  diagnostics: vscode.DiagnosticCollection,
  status: vscode.StatusBarItem,
  diff: string,
  language?: string,
): Promise<void> {
  try {
    const env = await resolveApiKeys(context);
    if (!env) return;
    const settings = vscode.workspace.getConfiguration('codeReview');
    const provider = settings.get<'auto' | Provider>('provider', 'auto');
    const categories = settings.get<ReviewCategory[]>('enabledCategories', [...reviewCategories]);
    const client = createLLMClientFromEnv(env, provider);
    status.text = '$(sync~spin) Reviewing... 0/0 hunks';
    status.show();
    const comments = await reviewDiff(diff, {
      categories,
      language,
      client,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      onProgress: ({ completed, total }) => {
        status.text = `$(sync~spin) Reviewing... ${completed}/${total} hunks`;
      },
    });
    const filtered = filterByMinimum(
      comments,
      settings.get<ReviewCategory>('minSeverity', 'style'),
    );
    await publishDiagnostics(diagnostics, filtered);
    showResultsPanel(context, filtered);
    void vscode.window.showInformationMessage(
      filtered.length === 0
        ? 'AI Code Review found no issues.'
        : `AI Code Review found ${filtered.length} issue(s).`,
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`AI Code Review failed: ${errorMessage(error)}`);
  } finally {
    status.hide();
  }
}

async function resolveApiKeys(
  context: vscode.ExtensionContext,
): Promise<NodeJS.ProcessEnv | undefined> {
  const env = { ...process.env, ...(await loadWorkspaceProviderKeys()) };
  for (const provider of Object.keys(secretNames) as Provider[]) {
    const value = await context.secrets.get(secretNames[provider]);
    if (value) env[`${provider.toUpperCase()}_API_KEY`] = value;
  }
  if (env.GROQ_API_KEY || env.CEREBRAS_API_KEY || env.GEMINI_API_KEY) return env;
  const saved = await setApiKey(context);
  if (!saved) return undefined;
  env[`${saved.provider.toUpperCase()}_API_KEY`] = saved.key;
  return env;
}

async function loadWorkspaceProviderKeys(): Promise<NodeJS.ProcessEnv> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return {};
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, '.env'));
    const text = new TextDecoder().decode(bytes);
    const keys: NodeJS.ProcessEnv = {};
    for (const line of text.split(/\r?\n/)) {
      const match =
        /^\s*(?:export\s+)?(GROQ_API_KEY|CEREBRAS_API_KEY|GEMINI_API_KEY)\s*=\s*(.*?)\s*$/.exec(
          line,
        );
      if (!match?.[1] || !match[2]) continue;
      keys[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return keys;
  } catch {
    return {};
  }
}

async function setApiKey(
  context: vscode.ExtensionContext,
): Promise<{ provider: Provider; key: string } | undefined> {
  const provider = (await vscode.window.showQuickPick(['groq', 'cerebras', 'gemini'], {
    title: 'Choose an AI code review provider',
    placeHolder: 'Provider',
  })) as Provider | undefined;
  if (!provider) return undefined;
  const key = await vscode.window.showInputBox({
    title: `Set ${provider} API key`,
    prompt: 'Stored securely in VS Code SecretStorage on this machine.',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : 'An API key is required.'),
  });
  if (!key) return undefined;
  await context.secrets.store(secretNames[provider], key.trim());
  void vscode.window.showInformationMessage(`${provider} API key saved securely.`);
  return { provider, key: key.trim() };
}

async function publishDiagnostics(
  collection: vscode.DiagnosticCollection,
  comments: ReviewComment[],
): Promise<void> {
  collection.clear();
  const grouped = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.file) ?? [];
    existing.push(comment);
    grouped.set(comment.file, existing);
  }
  for (const [file, fileComments] of grouped) {
    const uri = resolveFileUri(file);
    const diagnostics = fileComments.map((comment) => {
      const line = Math.max(0, comment.line - 1);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
        comment.message,
        diagnosticSeverity(comment.severity),
      );
      diagnostic.source = 'AI Code Review';
      diagnostic.code = comment.severity;
      return diagnostic;
    });
    collection.set(uri, diagnostics);
  }
}

function showResultsPanel(context: vscode.ExtensionContext, comments: ReviewComment[]): void {
  const panel = vscode.window.createWebviewPanel(
    'codeReview.results',
    'AI Code Review Results',
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  );
  panel.webview.html = resultsHtml(comments);
  panel.webview.onDidReceiveMessage(
    async (message: { command?: string; index?: number }) => {
      if (message.command !== 'applySuggestion' || message.index === undefined) return;
      const comment = comments[message.index];
      if (!comment?.suggestion) return;
      const uri = resolveFileUri(comment.file);
      const document = await vscode.workspace.openTextDocument(uri);
      const line = Math.min(Math.max(0, comment.line - 1), document.lineCount - 1);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, document.lineAt(line).range, comment.suggestion);
      const applied = await vscode.workspace.applyEdit(edit);
      void vscode.window.showInformationMessage(
        applied ? 'Suggestion applied.' : 'Suggestion could not be applied.',
      );
    },
    undefined,
    context.subscriptions,
  );
}

function resultsHtml(comments: ReviewComment[]): string {
  const cards = comments.length
    ? comments
        .map(
          (comment, index) => `<article>
  <h3>${escapeHtml(comment.severity.toUpperCase())} · ${escapeHtml(comment.file)}:${comment.line}</h3>
  <p>${escapeHtml(comment.message)}</p>
  ${comment.suggestion ? `<pre>${escapeHtml(comment.suggestion)}</pre><button data-index="${index}">Apply Suggestion</button>` : ''}
</article>`,
        )
        .join('')
    : '<p>No issues found.</p>';
  return `<!doctype html><html><head><meta charset="UTF-8"><style>
body{font-family:var(--vscode-font-family);padding:16px}article{border-bottom:1px solid var(--vscode-panel-border);padding:8px 0 16px}h3{font-size:13px}pre{white-space:pre-wrap;background:var(--vscode-textCodeBlock-background);padding:8px}button{padding:6px 10px}
</style></head><body><h1>Review Results</h1>${cards}<script>
const vscode=acquireVsCodeApi();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({command:'applySuggestion',index:Number(button.dataset.index)})));
</script></body></html>`;
}

function fullDocumentDiff(document: vscode.TextDocument): string {
  return createSyntheticDiff(workspacePath(document.uri), document.getText().split(/\r?\n/), 1);
}

function selectionDiff(document: vscode.TextDocument, selection: vscode.Selection): string {
  return createSyntheticDiff(
    workspacePath(document.uri),
    document.getText(selection).split(/\r?\n/),
    selection.start.line + 1,
  );
}

function createSyntheticDiff(file: string, lines: string[], start: number): string {
  const body = lines.map((line) => `+${line}`).join('\n');
  return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +${start},${lines.length} @@\n${body}\n`;
}

function workspacePath(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder
    ? path.relative(folder.uri.fsPath, uri.fsPath).replaceAll(path.sep, '/')
    : path.basename(uri.fsPath);
}

function resolveFileUri(file: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, file) : vscode.Uri.file(file);
}

function requireEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) void vscode.window.showWarningMessage('Open a file before running AI Code Review.');
  return editor;
}

function chooseRepository(repositories: GitRepository[]): GitRepository | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  return (
    repositories.find((repo) => active?.fsPath.startsWith(repo.rootUri.fsPath)) ?? repositories[0]
  );
}

const ranks: Record<ReviewCategory, number> = { style: 0, performance: 1, bug: 2, security: 3 };
function filterByMinimum(comments: ReviewComment[], minimum: ReviewCategory): ReviewComment[] {
  return comments.filter((comment) => ranks[comment.severity] >= ranks[minimum]);
}

function diagnosticSeverity(category: ReviewCategory): vscode.DiagnosticSeverity {
  if (category === 'bug' || category === 'security') return vscode.DiagnosticSeverity.Error;
  if (category === 'performance') return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
