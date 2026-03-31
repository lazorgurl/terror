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

Symlink into the local plugins directory and register:

```bash
ln -s ~/.terror/src/.claude/plugins/terror ~/.claude/plugins/local/terror
```

Then add an entry to `~/.claude/plugins/installed_plugins.json` in the `"plugins"` object:

```jsonc
"terror@local": [
  {
    "scope": "user",
    "installPath": "<HOME>/.claude/plugins/local/terror",
    "version": "0.1.0",
    "installedAt": "<CURRENT_ISO_DATETIME>",
    "lastUpdated": "<CURRENT_ISO_DATETIME>"
  }
]
```

Replace `<HOME>` with the user's absolute home directory path (e.g. the output of `echo $HOME`). Replace `<CURRENT_ISO_DATETIME>` with the current time in ISO 8601 format.

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
