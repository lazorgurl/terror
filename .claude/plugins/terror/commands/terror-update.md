---
name: terror-update
description: Update Terror source, dependencies, and rebuild from the latest main branch
---

# Update Terror

Pull the latest Terror source, update dependencies, rebuild, and verify.

## Steps

1. **Pull latest source:**
   ```bash
   cd ~/.terror/src && git pull origin main
   ```

2. **Install updated dependencies:**
   ```bash
   cd ~/.terror/src && bun install
   ```

3. **Rebuild:**
   ```bash
   cd ~/.terror/src && bun run build
   ```

4. **Run tests to verify:**
   ```bash
   cd ~/.terror/src && bun test
   ```

5. **Report results to the user:**
   - If everything passed: tell them Terror is updated and suggest restarting Claude Code to pick up any new commands or agents.
   - If build or tests failed: show the errors. Offer to check `git log --oneline -5` for recent changes that might explain the failure. Offer to rollback with `git checkout <previous-commit>` + rebuild.

## Notes

- The plugin symlink auto-updates since it points to the source directory. No extra plugin install step needed.
- If the user hasn't installed Terror yet, redirect them to `/setup`.
