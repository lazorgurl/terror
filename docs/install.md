# Installing Terror

> **For agents:** Read this file and follow the steps. For humans: tell your agent to read `https://raw.githubusercontent.com/lazorgurl/terror/main/docs/install.md`

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

Restart Claude Code. Commands (`/setup`, `/infra`, `/provision`, `/inspect`, `/costs`, `/debug-infra`, `/doc-infra`, `/update`) and agents (architect, builder, guardian, debugger, scribe) will be available.

Run `/setup` to configure providers, auth, and MCP registration interactively.

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
