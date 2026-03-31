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

Two options:

### Option A: Development mode (current session only)

```bash
claude --plugin-dir ~/.terror/src/.claude/plugins/terror
```

### Option B: Persistent install

Symlink into the local plugins directory:

```bash
ln -s ~/.terror/src/.claude/plugins/terror ~/.claude/plugins/local/terror
```

Then enable the plugin. Add `"enabledPlugins"` to your Claude Code settings (either `~/.claude/settings.json` for all projects, or `.claude/settings.json` in a specific project):

```json
{
  "enabledPlugins": {
    "terror": true
  }
}
```

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
