# Engineering Decisions

This file records choices made where the build specification left implementation details open.

- **Runtime baseline:** Node.js 20 is used across packages, matching the GitHub Action runtime.
- **Package scope:** The requested placeholder scope is retained as `@yourscope`; rename it before publishing.
- **Module system:** Packages use ESM/NodeNext unless a target requires a bundle (VS Code and GitHub Action).
- **Generated artifacts:** The GitHub Action's `dist/index.js` is committed because Actions consumers do not install dependencies. Other build output is ignored.
