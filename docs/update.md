# Updating Terror

> **For agents:** Read this file and follow the steps. For humans: run `/terror-update` in Claude Code.

## Update source, dependencies, and rebuild

```bash
cd ~/.terror/src
git pull origin main
bun install
bun run build
```

## Verify

```bash
cd ~/.terror/src && bun test
```

If tests fail, the update may have introduced breaking changes. Check the git log for migration notes:

```bash
cd ~/.terror/src && git log --oneline -10
```

## Plugin

The plugin symlink (`~/.claude/plugins/terror` → `~/.terror/src/.claude/plugins/terror`) auto-updates when the source is pulled. No extra steps needed. Restart Claude Code to pick up new commands or agents.

## Rollback

If an update breaks things:

```bash
cd ~/.terror/src
git log --oneline -5          # find the last working commit
git checkout <commit-hash>
bun install
bun run build
```
