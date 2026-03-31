---
name: debug-mcp
description: Diagnose Terror MCP server connection failures
---

# Debug Terror MCP Connection

Systematically diagnose why the Terror MCP server isn't connecting.

## Step 1: Check if Terror source is installed

```bash
ls ~/.terror/src/packages/core/dist/bin.js
```

If the file doesn't exist:
- Check if `~/.terror/src` exists at all — if not, Terror was never installed. Run the install steps from `https://raw.githubusercontent.com/lazorgurl/terror/main/docs/install.md`.
- If `~/.terror/src` exists but `dist/bin.js` doesn't, it needs building: `cd ~/.terror/src && bun install && bun run build`

## Step 2: Check .mcp.json in the current project

```bash
cat .mcp.json
```

Verify:
- **command** must be the absolute path to bun (e.g. `/Users/you/.bun/bin/bun`), NOT `node` or `bun`. Run `which bun` to get the correct path.
- **args** must point to `bin.js` (NOT `index.js`). The path must be absolute (no `~`).
- If `.mcp.json` doesn't exist, offer to create it using the AskUserQuestion tool to gather the project ID and region.

Common mistakes to check:
- Using `node` instead of `bun` — dependencies are in Bun's module store
- Using `index.js` instead of `bin.js` — `index.js` only exports modules, it doesn't start a server
- Using `~` in paths — `.mcp.json` doesn't expand tilde
- Using relative paths — must be absolute

## Step 3: Test the server directly

Run the server to see if it starts:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | <bun-path> <bin.js-path> 2>&1
```

Expected output: a JSON-RPC response with `"serverInfo":{"name":"terror","version":"0.1.0"}`.

If you see errors:
- **"Cannot find module"** — run `cd ~/.terror/src && bun install`
- **stderr output before the JSON** — the log level may be too verbose. Set `TERROR_LOG_LEVEL=error` in the `.mcp.json` env.
- **No output at all** — the entrypoint is wrong. Must be `bin.js`.

## Step 4: Check for conflicting configs

```bash
find . -name ".mcp.json" -maxdepth 3
```

Multiple `.mcp.json` files can shadow each other. The one closest to the project root wins.

## Step 5: Verify Claude Code sees the server

Tell the user to run `/mcp` in Claude Code. Check:
- Is "terror" listed as a server?
- What command and args does it show?
- Does the config location match the `.mcp.json` you just checked?

If the config location is different from what you expect, there's a `.mcp.json` in a parent directory or a different project.

## Step 6: Fix and reconnect

After fixing the issue, tell the user to:
1. Run `/mcp` in Claude Code
2. Select "terror"
3. Click "Reconnect"

If it still fails, check if `bun` works in a fresh shell — the PATH in Claude Code's spawned processes may differ from the user's terminal.
