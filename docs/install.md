# Installing Terror

> **For agents:** Read this file and follow the steps. For humans: tell your agent to read `https://raw.githubusercontent.com/lazorgurl/terror/main/docs/install.md`

## Install

```bash
git clone https://github.com/lazorgurl/terror.git ~/.terror/src
cd ~/.terror/src
bun install
bun run build
```

## Register MCP server

Add to `.mcp.json` in your project root:

```jsonc
{
  "mcpServers": {
    "terror": {
      "command": "node",
      "args": ["~/.terror/src/packages/core/dist/index.js"],
      "env": {
        "TERROR_PROVIDERS": "gcp",
        "GCP_PROJECT_ID": "your-project-id",
        "GCP_REGION": "us-central1"
      }
    }
  }
}
```

## Install Claude Code plugin

```bash
ln -s ~/.terror/src/.claude/plugins/terror ~/.claude/plugins/terror
```

Restart Claude Code. Commands (`/infra`, `/provision`, `/inspect`, `/costs`, `/debug-infra`, `/doc-infra`) and agents (architect, builder, guardian, debugger, scribe) will be available.

## GCP auth

Terror opens a browser for Google Cloud OAuth on first use. Tokens are stored in `~/.terror/credentials.json`.

Alternatively, set `GOOGLE_APPLICATION_CREDENTIALS` in `.mcp.json` env for service account auth.

## Verify

Run `/infra` in Claude Code. If the MCP server isn't connected, check that `~/.terror/src/packages/core/dist/index.js` exists.

## Update

```bash
cd ~/.terror/src && git pull && bun install && bun run build
```
