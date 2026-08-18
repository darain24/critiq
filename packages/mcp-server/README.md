# @yourscope/review-mcp-server

A local MCP stdio server exposing exactly one tool, `review_code`. It runs on the agent host and calls the enabled model API directly. Set `GROQ_API_KEY`, `CEREBRAS_API_KEY`, and/or `GEMINI_API_KEY` in the MCP server environment.

## Claude Code / Claude Desktop

```json
{
  "mcpServers": {
    "ai-code-review": {
      "command": "npx",
      "args": ["-y", "@yourscope/review-mcp-server"],
      "env": { "GROQ_API_KEY": "your-key" }
    }
  }
}
```

## Generic MCP client

```json
{
  "name": "ai-code-review",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@yourscope/review-mcp-server"],
  "environment": { "GEMINI_API_KEY": "your-key" }
}
```

The tool input is `{ "diff": "...", "language": "typescript", "categories": ["bug"] }`. Its text result is a formatted JSON array of review comments.
