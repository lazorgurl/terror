---
name: debug-infra
description: Systematic infrastructure debugging — networking, IAM, service health, logs
---

# Debug Infrastructure

Systematically diagnose infrastructure issues.

## Steps

1. **Gather symptoms.** Ask the user what they are experiencing:
   - Can't connect to a service
   - Deployment failed
   - Timeouts or high latency
   - 5xx errors
   - Permission denied
   - Resource not found
   - Unexpected behavior

2. **Identify the affected resource.** Call `terror_status` to list resources and ask the user to confirm which resource or service is affected.

3. **Systematic checks.** Based on the symptom, run through the relevant checks in order:

   **Connectivity issues (can't connect, timeout):**
   - Check resource health via `terror_health`
   - Verify the resource is running and in the correct state
   - Check security groups / firewall rules for the relevant ports
   - Verify DNS resolution if a domain is involved
   - Check VPC routing and subnet configuration
   - Test from the same network context (public vs private)

   **Permission errors (403, permission denied):**
   - List IAM bindings on the resource (`gcp_iam_list`, `aws_iam_list`)
   - Check the service account or role being used
   - Verify the required permissions for the operation
   - Check for org-level policies or SCPs that might block access

   **5xx errors:**
   - Check service health and recent deployments
   - Look at resource utilization (CPU, memory, connections)
   - Check dependent services (database, cache, external APIs)
   - Review recent configuration changes

   **Deployment failures:**
   - Check the deployment logs
   - Verify the container image or artifact exists
   - Check resource quotas and limits
   - Verify IAM permissions for the deployment service account

4. **Hypothesis and resolution.** After gathering data:
   - State the most likely root cause
   - Propose a fix with the specific Terror commands to run
   - Use the decision gate before applying any changes
   - Verify the fix resolves the issue
