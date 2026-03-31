---
name: inspect
description: Deep inspection of current infrastructure — resources, relationships, and potential issues
---

# Inspect Infrastructure

Perform a thorough inspection of all managed infrastructure.

## Steps

1. **Inventory.** Call `terror_status` to list all managed resources. Group by:
   - Provider (GCP, AWS, Azure)
   - Type (compute, storage, database, networking, IAM)
   - Environment (production, staging, dev)

2. **Resource details.** For each resource group, use provider-specific list tools:
   - `gcp_compute_list`, `aws_ec2_list` for compute
   - `gcp_storage_list`, `aws_s3_list` for storage
   - `gcp_iam_list`, `aws_iam_list` for IAM
   Show key attributes: state, region, creation date, tags/labels.

3. **Relationship mapping.** Identify how resources connect:
   - Which compute instances talk to which databases
   - Load balancer targets
   - VPC/subnet membership
   - IAM bindings and service accounts

4. **Issue detection.** Flag potential problems:
   - Unattached disks or elastic IPs (wasted cost)
   - Overly permissive IAM roles (security risk)
   - Public storage buckets without explicit justification
   - Resources missing tags or labels
   - Instances running in default VPC
   - Resources in unexpected regions

5. **Present findings.** Organize output as:
   - Resource inventory table
   - Relationship summary
   - Issues found, ranked by severity (critical / warning / info)
   - Recommended actions for each issue
