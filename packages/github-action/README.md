# AI Code Review GitHub Action

This Node 20 action reviews pull-request diffs on the runner and posts inline findings plus one summary. No external service is deployed; only the selected model provider receives diff hunks.

```yaml
- uses: darain24/critiq@v1
  with:
    github-token: ${{ github.token }}
    groq-api-key: ${{ secrets.GROQ_API_KEY }}
    min-severity: style
```

Grant `pull-requests: write` and `contents: read`. At least one provider key is required. The root `action.yml` makes the action consumable as `darain24/critiq@v1` and points to this package's checked-in bundle. `dist/index.js` is produced with `pnpm --filter @critiq/ai-code-review-action build` and is committed so consumers need no runtime install step.
