# Critiq AI Code Review for VS Code

Review the current file, a selection, or staged Git changes without a hosted backend. The extension calls Groq, Cerebras, or Gemini directly using your key.

## Setup

1. Run any **Critiq** command from the Command Palette.
2. Choose a provider and enter its API key. The key is password-masked and stored in VS Code SecretStorage.
3. Optionally set `codeReview.provider`, `codeReview.enabledCategories`, and `codeReview.minSeverity`.

For local development, the extension also reads `GROQ_API_KEY`, `CEREBRAS_API_KEY`, and `GEMINI_API_KEY` from the first workspace folder's `.env` file or from the Extension Development Host environment. From the repository root, run `pnpm --filter ai-code-review-vscode build`, open the repository in VS Code, and press F5.
