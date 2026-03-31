# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Terror** — Agentic Terraform. An MCP tool for agent-native cloud infrastructure management. Open source under MIT.

Agents provision and manage cloud resources through MCP tools instead of CLI commands or HCL files. Terror is **stateless** — cloud provider APIs are the source of truth. There are no local or remote state files.

## Tech Stack

TypeScript, Node.js, pnpm monorepo, vitest, eslint + prettier.

## Package Structure

| Package | Path | Purpose |
|---------|------|---------|
| `@terror/core` | `packages/core` | MCP server, provider registry, plan engine (action list + rollback), OAuth broker, shared types |
| `@terror/gcp` | `packages/gcp` | GCP provider (MVP). Full CRUD: Compute Engine, Cloud Storage, VPC/Firewalls, IAM, Cloud Run, Cloud Functions, Cloud SQL, Pub/Sub |

Post-MVP providers: AWS, Cloudflare, DigitalOcean.

## Architecture

- **Stateless** — no state files. Always query cloud APIs for current state.
- **Plan-then-apply** — build action list, validate state before each action, execute, validate after. Auto mode skips user review.
- **Transactional rollback** — on validation failure mid-plan, halt and rollback completed actions in reverse order. Every mutation must have a rollback handler.
- **Two-layer tools** — low-level CRUD per resource type + high-level intent-based composite operations (e.g. "deploy a static site").
- **Provider plugin system** — each provider is a separate npm package implementing the `Provider` interface from core. Provider packages depend on `@terror/core` via `workspace:*` protocol.
- **OAuth broker** — local HTTP server handles OAuth callbacks for unified auth UX across providers.
- **MCP stdio transport** — runs as a standard MCP server, added to Claude Code/Desktop config.

## Build Commands

```bash
pnpm install                          # install dependencies
pnpm build                            # build all packages
pnpm test                             # run all tests
pnpm dev                              # watch mode build
pnpm --filter @terror/core test       # test single package
pnpm --filter @terror/gcp build       # build single package
```

## Key Conventions

- **stdout is sacred** — reserved for MCP stdio transport. All logging goes to stderr as structured JSON.
- **Tool inputSchemas are JSON Schema** — these are what agents see, so they must be descriptive and well-documented.
- **Resource definitions include rollback handlers** for every mutation.
- **No state files** — never write or read local/remote state. Always query cloud APIs.

## Branching

Feature/fix branches only. Never commit to main directly. PRs required.
