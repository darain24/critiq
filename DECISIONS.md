# Engineering Decisions

This file records choices made where the build specification left implementation details open.

- **Runtime baseline:** Node.js 20 is used across packages, matching the GitHub Action runtime.
- **Package scope:** The requested placeholder scope is retained as `@yourscope`; rename it before publishing.
- **Module system:** Packages use ESM/NodeNext unless a target requires a bundle (VS Code and GitHub Action).
- **Generated artifacts:** The GitHub Action's `dist/index.js` is committed because Actions consumers do not install dependencies. Other build output is ignored.
- **Severity ordering:** Filtering orders categories as `style < performance < bug < security`; the category vocabulary doubles as the requested severity vocabulary.
- **Review batching:** The engine reviews each hunk/category pair sequentially. This makes provider throttling and progress deterministic and avoids bursting free-tier rate limits.
- **File and selection reviews:** VS Code creates an in-memory unified diff whose added-line numbers match the document, keeping all parsing and prompt logic inside core.
- **Keys in VS Code:** SecretStorage has priority, while inherited environment variables remain supported for F5 and `.env`-driven development shells.
- **Default cache:** Cache entries are written atomically to `.cache/code-review-system.json` only when a caller supplies a cache key. Callers can replace the cache entirely.
- **MCP smoke test:** The stdio test uses a deletion-only fixture so it exercises a real server/client transport without spending API quota or requiring a secret.
- **VS Code test baseline:** The integration host is pinned to VS Code 1.95, the extension's minimum supported version, for reproducible API coverage.
