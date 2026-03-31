# Installing Terror

> **For agents:** Read this file and follow the steps. For humans: tell your agent to read `https://raw.githubusercontent.com/lazorgurl/terror/main/docs/install.md`

## Install

```bash
git clone https://github.com/lazorgurl/terror.git ~/.terror/src
cd ~/.terror/src
bun install
bun run build
```

## Install Claude Code plugin

Symlink into the local plugins directory and register it:

```bash
ln -s ~/.terror/src/.claude/plugins/terror ~/.claude/plugins/local/terror
```

Then add an entry to `~/.claude/plugins/installed_plugins.json` in the `"plugins"` object:

```jsonc
"terror@local": [
  {
    "scope": "user",
    "installPath": "/Users/julia/.claude/plugins/local/terror",
    "version": "0.1.0",
    "installedAt": "2026-04-01T00:00:00.000Z",
    "lastUpdated": "2026-04-01T00:00:00.000Z"
  }
]
```

Adjust the `installPath` to use the actual home directory (replace `/Users/julia` with the correct path). The `installedAt` and `lastUpdated` timestamps should use the current datetime.

Restart Claude Code, then run `/setup` to configure providers, auth, and MCP registration interactively.

## Manual MCP registration (if not using /setup)

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

## Update

See [docs/update.md](https://raw.githubusercontent.com/lazorgurl/terror/main/docs/update.md) or run `/update` in Claude Code (via the terror plugin).
