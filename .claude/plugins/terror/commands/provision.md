---
name: provision
description: Guided infrastructure provisioning with decision gates
---

# Provision Infrastructure

Walk the user through provisioning new cloud infrastructure with Terror.

## Steps

1. **Gather requirements.** Ask the user what they want to deploy:
   - Static site / CDN
   - API backend (Cloud Run, Lambda, ECS, etc.)
   - Database (Cloud SQL, RDS, PlanetScale, etc.)
   - Storage bucket
   - Networking (VPC, subnets, load balancer)
   - Custom / other

2. **Select provider.** Ask which cloud provider (GCP, AWS, Azure) or confirm the default if one is configured. Call `terror_status` to see what providers are already in use.

3. **Configure.** Based on the resource type, ask for:
   - Region / zone
   - Instance size or tier
   - Networking requirements (public/private, VPC)
   - Any dependencies on existing resources

4. **Build the plan.** Use Terror's provider tools to construct the provisioning plan. For example:
   - `gcp_compute_create` for VMs
   - `gcp_cloud_run_deploy` for serverless containers
   - `aws_rds_create` for databases
   Present the plan to the user before executing.

5. **Decision gate.** This is critical. Before executing any mutating operation:
   - Show exactly what will be created, modified, or destroyed
   - Show estimated cost impact if available
   - Ask for explicit confirmation
   - If the user says no, offer to modify the plan

6. **Execute.** Run the plan and report results. Call `terror_health` on newly created resources to verify they came up correctly.

7. **Post-provision.** Suggest next steps:
   - Run `/inspect` to verify the new resources
   - Run `/doc-infra` to update documentation
   - Set up monitoring or alerts if applicable
