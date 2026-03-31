<div align="center">

```
 ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄   ▄▄▄▄▄▄   ▄▄▄▄▄▄▄ ▄▄▄▄▄▄
█       █       █   ▄  █ █   ▄  █ █       █   ▄  █
█▄     ▄█    ▄▄▄█  █ █ █ █  █ █ █ █   ▄   █  █ █ █
  █   █ █   █▄▄▄█   █▄▄█▄█   █▄▄█▄█  █ █  █   █▄▄█▄
  █   █ █    ▄▄▄█    ▄▄  █    ▄▄  █  █▄█  █    ▄▄  █
  █   █ █   █▄▄▄█   █  █ █   █  █ █       █   █  █ █
  █▄▄▄█ █▄▄▄▄▄▄▄█▄▄▄█  █▄█▄▄▄█  █▄█▄▄▄▄▄▄▄█▄▄▄█  █▄
```

**The ghost in your cloud.**

[![License: MIT](https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-8b5cf6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-tool-8b5cf6?style=flat-square)](https://modelcontextprotocol.io)

</div>

---

Terror is an agentic Terraform replacement built as an MCP tool. Agents provision and manage cloud infrastructure through natural language -- no HCL, no state files. Cloud provider APIs are the sole source of truth, and every mutation passes through a decision gate where the agent evaluates its own plan before executing.

## Features

- **Stateless** -- cloud APIs are the source of truth, no local or remote state files
- **Decision Gate** -- agents evaluate their own plans before acting, plan-then-apply with validation
- **Transactional rollback** -- on failure mid-plan, completed actions roll back in reverse order
- **Token-efficient responses** -- summary-first, delta-only updates, paginated results
- **Real-time TUI status** -- live progress via stderr, stdout reserved for MCP transport
- **OAuth broker** -- local HTTP server handles OAuth callbacks for unified auth across providers
- **Provider plugin system** -- each cloud provider is a separate package implementing a shared interface

## Quick Start

```bash
bun add @terror/core @terror/gcp
```

Add Terror to your MCP config:

```jsonc
// .mcp.json
{
  "mcpServers": {
    "terror": {
      "command": "npx",
      "args": ["@terror/core"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/credentials.json"
      }
    }
  }
}
```

Then ask your agent to manage infrastructure:

```
> Create a Cloud Storage bucket called "my-assets" in us-central1
> Deploy this Cloud Run service with 512MB memory
> Show me all VMs in project "staging"
```

## Providers

| Provider | Status |
|:---------|:-------|
| **GCP** | Full CRUD -- Compute, Storage, VPC, IAM, Cloud Run, Functions, SQL, Pub/Sub |
| AWS | Coming soon |
| Cloudflare | Coming soon |
| DigitalOcean | Coming soon |

## Architecture

```
Agent <--stdio--> @terror/core <--plugin--> @terror/gcp
                       |                        |
                  Plan Engine              Cloud APIs
                  OAuth Broker
                  Tool Registry
```

Two-layer tool design: low-level CRUD per resource type, plus high-level intent-based composite operations. Every mutation carries a rollback handler.

See [`CLAUDE.md`](CLAUDE.md) for full architectural details.

## Install

Tell your agent to read [`docs/install.md`](https://raw.githubusercontent.com/lazorgurl/terror/main/docs/install.md).

## License

[MIT](LICENSE) -- Roguelite Software
