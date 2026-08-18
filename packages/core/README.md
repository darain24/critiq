# @yourscope/review-core

Shared TypeScript engine for parsing unified diffs and reviewing their added lines with Groq, Cerebras, or Gemini. It has no hosted service or database.

```ts
import { reviewDiff } from '@yourscope/review-core';

const comments = await reviewDiff(diff, { categories: ['bug', 'security'] });
```

Set one or more of `GROQ_API_KEY`, `CEREBRAS_API_KEY`, and `GEMINI_API_KEY`. Providers fail over in that order on rate limits and timeouts. Supply `client` or `cache` in the options to integrate custom LLM and cache implementations.
