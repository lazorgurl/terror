---
name: costs
description: Show cost estimates and breakdown for current and planned infrastructure
---

# Infrastructure Costs

Analyze and present infrastructure cost information.

## Steps

1. **Current spend.** Call `terror_status` and provider-specific tools to gather resource inventory. For each resource, estimate monthly cost based on type and configuration:
   - Compute: instance type, hours running
   - Storage: capacity, access tier, egress
   - Database: instance tier, storage, backups
   - Networking: load balancers, NAT gateways, egress

2. **Cost breakdown.** Present costs grouped by:
   - Provider
   - Resource type
   - Environment (production vs staging vs dev)
   - Team or project (based on labels/tags)

3. **Optimization opportunities.** Identify savings:
   - Idle or underutilized resources (low CPU, no traffic)
   - Resources that could use committed use discounts or reserved instances
   - Oversized instances relative to actual usage
   - Dev/staging resources running 24/7 that could be scheduled
   - Unattached disks, unused IPs, orphaned snapshots

4. **Planned changes.** If the user has pending Terror plans, estimate the cost delta:
   - What the new resources will cost
   - What resources are being removed
   - Net monthly impact

5. **Present summary.** Show:
   - Total estimated monthly cost
   - Top 5 most expensive resources
   - Top 3 optimization opportunities with estimated savings
   - Cost trend if historical data is available
