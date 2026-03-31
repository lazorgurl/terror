---
name: infra
description: Show current infrastructure status and route to provisioning, inspection, or debugging workflows
---

# Infrastructure Status

Check the current state of infrastructure managed by Terror.

## Steps

1. Call `terror_status` to get an overview of all managed infrastructure.
2. Call `terror_health` to check the health of active resources.
3. Present a summary to the user:
   - Total resources managed, grouped by provider and type
   - Any resources in unhealthy or degraded state
   - Recent changes or drift detected
4. Ask the user what they want to do next:
   - **Provision** new infrastructure (`/provision`)
   - **Inspect** existing resources in detail (`/inspect`)
   - **Debug** an infrastructure issue (`/debug-infra`)
   - **Review costs** (`/costs`)
   - **Generate documentation** (`/doc-infra`)

Route to the appropriate workflow based on their response. If a resource is unhealthy, proactively suggest `/debug-infra`.
