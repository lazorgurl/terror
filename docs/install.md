# Installing Terror

Instructions for Claude Code agents (and humans) to install Terror and its Claude Code plugin from source.

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Git

## Install from GitHub

```bash
git clone https://github.com/lazorgurl/terror.git
cd terror
pnpm install
pnpm build
```

## Register as an MCP server

Add Terror to your Claude Code MCP config. Create or edit `.mcp.json` in your project root:

```jsonc
{
  "mcpServers": {
    "terror": {
      "command": "node",
      "args": ["/path/to/terror/packages/core/dist/index.js"],
      "env": {
        "TERROR_PROVIDERS": "gcp",
        "GCP_PROJECT_ID": "your-project-id",
        "GCP_REGION": "us-central1"
      }
    }
  }
}
```

Replace `/path/to/terror` with the absolute path to your cloned repo.

## Install the Claude Code plugin

The plugin provides slash commands (`/infra`, `/provision`, `/inspect`, `/costs`, `/debug-infra`, `/doc-infra`) and specialized agents (architect, builder, guardian, debugger, scribe).

Symlink the plugin into your Claude Code plugins directory:

```bash
# macOS / Linux
ln -s /path/to/terror/.claude/plugins/terror ~/.claude/plugins/terror
```

Or copy it:

```bash
cp -r /path/to/terror/.claude/plugins/terror ~/.claude/plugins/terror
```

After installing, restart Claude Code. The commands and agents will be available in all projects.

## Verify installation

In Claude Code, run:

```
/infra
```

This should invoke Terror's status tools and show your infrastructure overview. If the MCP server isn't connected, you'll see a connection error — double-check your `.mcp.json` paths.

## GCP authentication

Terror uses an OAuth broker for authentication. On first use, it will open a browser window for Google Cloud OAuth. Tokens are stored in `~/.terror/credentials.json`.

Alternatively, set `GOOGLE_APPLICATION_CREDENTIALS` in your `.mcp.json` env to use a service account key file.

## Development

If you're contributing to Terror itself:

```bash
pnpm dev          # watch mode build
pnpm test         # run all tests
pnpm lint         # eslint + prettier check
```

See [CLAUDE.md](../CLAUDE.md) for architecture and conventions.
