# Critiq

A production-oriented TypeScript monorepo with one review engine and three ways to use it: inside VS Code, on GitHub pull requests, or from any MCP-compatible coding agent. There is no hosted application, database, account system, or metered backend owned by this project.

## Architecture

```text
                          user-supplied API keys
                  ┌──────────┬────────────┬──────────┐
                  │   Groq   │  Cerebras  │  Gemini │
                  └────▲─────┴─────▲──────┴────▲─────┘
                       │ direct API calls / fallback
                ┌──────┴────────────────────────┴──────┐
                │ packages/core                        │
                │ parse → prompt → validate/repair     │
                │ config → filter → optional cache     │
                └──────▲────────────▲────────────▲─────┘
                       │ workspace  │ workspace  │ workspace
              ┌────────┴───┐  ┌────┴─────┐  ┌───┴────────┐
              │ VS Code    │  │ GitHub   │  │ MCP stdio  │
              │ local host │  │ own CI   │  │ local agent│
              └────────────┘  └──────────┘  └────────────┘
```

All review behavior lives in `@critiq/review-core`. Clients supply diffs, credentials, presentation, and platform-specific I/O; they do not duplicate parsing, prompting, provider fallback, JSON repair, config, or cache logic.

## Requirements and installation

- Node.js 20 or newer
- Corepack with pnpm 10.15.0
- At least one supported provider key for live reviews

```bash
corepack enable
corepack pnpm install
corepack pnpm -r build
corepack pnpm -r test
corepack pnpm -r lint
```

Copy `.env.example` to `.env` and populate only the providers you want. `.env` files are ignored. The VS Code extension reads the first workspace folder's `.env` for F5 development; other packages use the shell or CI environment so secret handling stays explicit.

An optional `.reviewconfig.json` in the caller's working directory can configure categories, ignored paths, and minimum severity. Start from `.reviewconfig.example.json`.

## Provider keys

- **Groq:** create a key in the [GroqCloud API Keys console](https://console.groq.com/keys) and set `GROQ_API_KEY`. The default model is `llama-3.3-70b-versatile`.
- **Cerebras:** create a key in the [Cerebras Cloud console](https://cloud.cerebras.ai/) and set `CEREBRAS_API_KEY`. The default model is `llama-3.3-70b`.
- **Gemini:** create a key in [Google AI Studio](https://aistudio.google.com/app/apikey) and set `GEMINI_API_KEY`. The default model is `gemini-2.0-flash`.

When multiple keys exist, core tries Groq, Cerebras, then Gemini. It advances only after a rate limit or timeout; authentication and other non-transient errors are reported immediately so a bad configuration is not hidden. Provider free tiers and limits can change, so check each provider's current terms before use.

## Core engine

```ts
import { reviewDiff } from '@critiq/review-core';

const findings = await reviewDiff(unifiedDiff, {
  categories: ['bug', 'security'],
  language: 'typescript',
  cacheKey: `${commitSha}:${fileHash}`,
});
```

Core parses only added lines, asks for strict JSON, validates with Zod, and performs one explicit repair attempt after invalid model output. Findings whose file, category, or line does not match the current hunk are discarded. See `packages/core/README.md` for extension points.

## VS Code extension

```bash
corepack pnpm --filter ai-code-review-vscode build
```

Open this repository in VS Code and use the launch configuration in `packages/vscode-extension/.vscode/launch.json`, or open that package and press F5. Commands review the active file, the selection, or the staged Git diff. Keys entered in the UI are password-masked and saved with SecretStorage. Findings appear both as diagnostics and in a webview with one-click line replacements where suggestions exist.

Run its real Extension Host integration test with:

```bash
corepack pnpm --filter ai-code-review-vscode test
```

## GitHub Action

The implementation is in `packages/github-action`, while the Marketplace-facing `action.yml` is at the repository root and points to its checked-in Node 20 bundle. Use `darain24/critiq@v1`, grant `contents: read` and `pull-requests: write`, and pass at least one repository secret. It posts inline comments only on added diff lines and always posts one severity summary. Copy `packages/github-action/examples/review.yml` as a starting point.

Rebuild the distributable after source changes:

```bash
corepack pnpm --filter @critiq/ai-code-review-action build
git add -f packages/github-action/dist/index.js
```

## MCP server

Run the local stdio server with a provider key in its environment:

```bash
GROQ_API_KEY=your-key npx -y @critiq/review-mcp-server
```

It exposes exactly one tool, `review_code`, taking a unified diff plus optional language and categories. Ready-to-paste Claude and generic MCP configurations are in `packages/mcp-server/README.md`.

## Why no hosting bill is required

The extension and MCP server use the user's machine. The action uses the user's GitHub-hosted or self-hosted runner. Each process sends requests directly to a provider using the user's own key, and the optional cache is a local JSON file. This repository therefore has no service to deploy and no project-owned infrastructure bill at any usage level.

That architecture does not make third-party compute unlimited: provider quotas, GitHub Actions allowances, and pricing remain attached to the user's accounts. The defaults are selected for providers that offer free access, but users are responsible for current quotas and any opt-in paid usage.

## Contributing

1. Create a branch and keep review logic in `packages/core`.
2. Add fixture-backed core tests for behavior changes and platform tests for client-specific I/O.
3. Run `corepack pnpm -r build`, `corepack pnpm -r test`, `corepack pnpm -r lint`, and `corepack pnpm format:check`.
4. Rebuild and commit the GitHub Action bundle when its source or core changes.
5. Never commit keys, `.env` files, review caches, or provider responses containing private code.

The VS Code publisher placeholder `yourscope` must be renamed before its Marketplace release. Additional implementation choices are recorded in `DECISIONS.md`.
