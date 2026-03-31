---
name: doc-infra
description: Generate or update infrastructure documentation from current cloud state
---

# Document Infrastructure

Generate comprehensive infrastructure documentation from the live state of your cloud resources.

## Steps

1. **Read current state.** Call `terror_status` and provider-specific list tools to build a complete picture of all managed resources.

2. **Gather context.** Check for existing documentation:
   - Look for `docs/infrastructure.md` or similar in the project
   - Read any existing architecture docs to preserve context that can't be inferred from resource state alone (design rationale, historical decisions)

3. **Generate documentation.** Produce a markdown document covering:

   **Architecture Overview**
   - High-level description of the system
   - Provider(s) and region(s) in use
   - Environment breakdown (production, staging, dev)

   **Resource Inventory**
   - Table of all resources with type, name, region, and status
   - Grouped by logical service or function

   **Networking Topology**
   - VPCs, subnets, and their CIDR ranges
   - Load balancers and their targets
   - Firewall rules and security groups
   - DNS configuration

   **Data Stores**
   - Databases with type, version, and tier
   - Storage buckets and their access policies
   - Cache instances

   **Access & IAM**
   - Service accounts and their roles
   - Key IAM bindings
   - Access patterns (which services talk to which)

   **Cost Summary**
   - Estimated monthly cost by resource group

4. **Write the document.** Save to the project's docs directory (default: `docs/infrastructure.md`). If the file already exists, update it in place, preserving any manually-written sections marked with `<!-- manual -->` comments.

5. **Report.** Tell the user what was documented and flag any resources that seem undocumented or unusual.
