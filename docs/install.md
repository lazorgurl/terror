# Installing Terror

> **For agents:** Read this file and follow the steps. For humans: tell your agent to read `https://raw.githubusercontent.com/lazorgurl/terror/main/docs/install.md`

## Prerequisites

- [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- Git

## Install source

```bash
git clone https://github.com/lazorgurl/terror.git ~/.terror/src
cd ~/.terror/src
bun install
bun run build
```

## Install Claude Code plugin

Add the Terror marketplace and enable the plugin. Read `~/.claude/settings.json` and merge these keys:

```jsonc
{
  "enabledPlugins": {
    "terror@terror-marketplace": true
  },
  "extraKnownMarketplaces": {
    "terror-marketplace": {
      "source": {
        "source": "github",
        "repo": "lazorgurl/terror"
      }
    }
  }
}
```

Do not overwrite existing keys — merge into the existing `enabledPlugins` and `extraKnownMarketplaces` objects.

Restart Claude Code. Run `/setup` to configure providers, auth, and MCP registration interactively.

## Manual MCP registration (if not using /setup)

Add to `.mcp.json` in your project root. Use the absolute path to `bun` (find it with `which bun`):

```jsonc
{
  "mcpServers": {
    "terror": {
      "command": "<ABSOLUTE_PATH_TO_BUN>",
      "args": ["<HOME>/.terror/src/packages/core/dist/bin.js"],
      "env": {
        "TERROR_PROVIDERS": "gcp",
        "GCP_PROJECT_ID": "your-project-id",
        "GCP_REGION": "us-central1"
      }
    }
  }
}
```

Replace `<ABSOLUTE_PATH_TO_BUN>` with the output of `which bun`. Replace `<HOME>` with the user's home directory. The entrypoint is `bin.js` (not `index.js`).

**Important:** Use `bun` not `node` — dependencies are in Bun's module store and Node.js cannot resolve them.

## Troubleshooting

If the MCP server fails to connect, run `/debug-mcp` in Claude Code for guided diagnostics. Common issues:

- **"command not found"** — use absolute path to bun (e.g. `/Users/you/.bun/bin/bun`)
- **Wrong entrypoint** — must be `bin.js`, not `index.js`
- **Using `node` instead of `bun`** — dependencies won't resolve
- **`~/.terror/src` doesn't exist** — run the install step first

## Update

See [docs/update.md](https://raw.githubusercontent.com/lazorgurl/terror/main/docs/update.md) or run `/update` in Claude Code.
