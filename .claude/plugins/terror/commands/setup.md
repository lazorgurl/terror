---
name: setup
description: Interactive onboarding — configure cloud providers, auth, and project settings for Terror
---

# Terror Setup

Walk the user through configuring Terror for their project. They should never have to manually edit config files.

## Step 1: Welcome + detect existing config

Check if `.mcp.json` already has a `terror` entry and if `~/.terror/credentials.json` exists. If Terror is already configured, tell the user what's set up and ask if they want to reconfigure or add a provider.

If Terror source isn't installed at `~/.terror/src`, install it:
```bash
git clone https://github.com/lazorgurl/terror.git ~/.terror/src
cd ~/.terror/src && bun install && bun run build
```

## Step 2: Choose providers

Use the AskUserQuestion tool:

**Question:** "Which cloud providers do you want to manage with Terror?"
- **GCP** — Google Cloud Platform (full CRUD support)
- **AWS** — Amazon Web Services (coming soon — read-only)
- **Cloudflare** — Cloudflare Workers, DNS, R2 (coming soon — read-only)
- **DigitalOcean** — Droplets, Spaces, Apps (coming soon — read-only)

Allow multi-select.

## Step 3: Configure each selected provider

For each provider the user selected, ask provider-specific questions using AskUserQuestion:

### GCP
**Question:** "How do you want to authenticate with GCP?"
- **OAuth (recommended)** — Terror opens a browser for Google OAuth. Best for personal dev.
- **Service account key** — Use a JSON key file. Best for CI/service environments.
- **Application Default Credentials** — Use existing `gcloud auth` login.

Then ask:
- **"Which GCP project should Terror manage?"** — Free text. If they're unsure, run `gcloud projects list` to show their projects and let them pick.
- **"Which GCP region?"** — Options: us-central1, us-east1, us-west1, europe-west1, asia-east1, or Other.

If they chose OAuth, trigger the OAuth flow by telling them Terror will open a browser on first use.
If they chose service account, ask for the path to the key file.
If they chose ADC, verify it works by running `gcloud auth application-default print-access-token`.

### AWS (when available)
- Authentication method: SSO, access keys, or IAM role
- Default region
- Account ID

### Cloudflare (when available)
- API token
- Account ID

### DigitalOcean (when available)
- API token
- Default region

## Step 4: Write the MCP config

Generate the `.mcp.json` entry and write it to the project root. If `.mcp.json` already exists, merge the terror entry without overwriting other servers.

The config should look like:
```jsonc
{
  "mcpServers": {
    "terror": {
      "command": "node",
      "args": ["~/.terror/src/packages/core/dist/index.js"],
      "env": {
        "TERROR_PROVIDERS": "gcp",
        "GCP_PROJECT_ID": "<their-project>",
        "GCP_REGION": "<their-region>"
      }
    }
  }
}
```

Add env vars based on their provider selections and auth choices.

## Step 5: Install the Claude Code plugin

Read `~/.claude/settings.json` and merge these keys into the existing JSON (do not overwrite other keys):

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

Tell the user to restart Claude Code for the plugin to load.

## Step 6: Verify

Call `terror_health` to confirm the connection works. If it fails, diagnose:
- Is the MCP server path correct?
- Are credentials valid?
- Is the GCP project accessible?

If everything works, show a success message and suggest they try `/infra` or `/provision` next.

## Important

- Never ask the user to manually edit JSON files — always write configs programmatically.
- If something fails during setup, explain what went wrong and offer to retry that step.
- Store provider configs so they persist across sessions.
