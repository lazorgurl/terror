import type { Resource, Tool } from "@terror/core";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface ComputeResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
  getConsolidatedTool(clients: GcpClients, config: GcpConfig): Tool;
}

export const computeResource: ComputeResourceDefinition = {
  type: "compute-instance",

  async list(clients, config): Promise<Resource[]> {
    const resources: Resource[] = [];
    const iterable = clients.computeInstances.aggregatedListAsync({
      project: config.projectId,
    });

    for await (const [, scopedList] of iterable) {
      const items = scopedList.instances ?? [];
      for (const instance of items) {
        resources.push({
          id: instance.id?.toString() ?? "",
          type: "compute-instance",
          provider: "gcp",
          name: instance.name ?? "",
          status: mapInstanceStatus(instance.status ?? ""),
          properties: {
            zone: instance.zone,
            machineType: instance.machineType,
            selfLink: instance.selfLink,
            networkInterfaces: instance.networkInterfaces,
          },
          createdAt: new Date(instance.creationTimestamp ?? ""),
          updatedAt: new Date(),
        });
      }
    }
    return resources;
  },

  getTools(clients, config): Tool[] {
    return [
      {
        name: "gcp_compute_list",
        description:
          "List all Compute Engine instances in the project. Returns instance names, zones, machine types, and current status.",
        inputSchema: {
          type: "object",
          properties: {
            zone: {
              type: "string",
              description:
                "Filter by zone (e.g., 'us-central1-a'). If omitted, lists across all zones.",
            },
            filter: {
              type: "string",
              description:
                "GCP filter expression (e.g., 'status=RUNNING'). See Compute Engine API docs for syntax.",
            },
          },
        },
        handler: async (params) => {
          return computeResource.list(clients, config);
        },
      },
      {
        name: "gcp_compute_get",
        description:
          "Get detailed information about a specific Compute Engine instance by name and zone.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Instance name.",
            },
            zone: {
              type: "string",
              description: "Zone the instance is in (e.g., 'us-central1-a').",
            },
          },
          required: ["name", "zone"],
        },
        handler: async (params) => {
          const [instance] = await clients.computeInstances.get({
            project: config.projectId,
            instance: params.name as string,
            zone: params.zone as string,
          });
          return instance;
        },
      },
      {
        name: "gcp_compute_create",
        description:
          "Create a new Compute Engine instance. Specify machine type, boot disk image, zone, and network configuration.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name for the new instance.",
            },
            zone: {
              type: "string",
              description: "Zone to create the instance in (e.g., 'us-central1-a').",
            },
            machineType: {
              type: "string",
              description:
                "Machine type (e.g., 'e2-micro', 'n1-standard-1'). Defaults to 'e2-micro'.",
            },
            sourceImage: {
              type: "string",
              description:
                "Boot disk image (e.g., 'projects/debian-cloud/global/images/family/debian-12'). Defaults to Debian 12.",
            },
            diskSizeGb: {
              type: "number",
              description: "Boot disk size in GB. Defaults to 10.",
            },
            network: {
              type: "string",
              description: "VPC network name. Defaults to 'default'.",
            },
            subnet: {
              type: "string",
              description: "Subnet name within the VPC network.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Network tags for firewall rule targeting.",
            },
            labels: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Labels to apply to the instance.",
            },
          },
          required: ["name", "zone"],
        },
        handler: async (params) => {
          const zone = params.zone as string;
          const machineType = params.machineType as string | undefined ?? "e2-micro";
          const sourceImage =
            (params.sourceImage as string | undefined) ??
            "projects/debian-cloud/global/images/family/debian-12";
          const diskSizeGb = (params.diskSizeGb as number | undefined) ?? 10;
          const network = (params.network as string | undefined) ?? "default";

          const [operation] = await clients.computeInstances.insert({
            project: config.projectId,
            zone,
            instanceResource: {
              name: params.name as string,
              machineType: `zones/${zone}/machineTypes/${machineType}`,
              disks: [
                {
                  boot: true,
                  autoDelete: true,
                  initializeParams: {
                    sourceImage,
                    diskSizeGb: diskSizeGb.toString(),
                  },
                },
              ],
              networkInterfaces: [
                {
                  network: `global/networks/${network}`,
                  subnetwork: params.subnet
                    ? `regions/${config.region}/subnetworks/${params.subnet as string}`
                    : undefined,
                  accessConfigs: [{ name: "External NAT", type: "ONE_TO_ONE_NAT" }],
                },
              ],
              tags: params.tags ? { items: params.tags as string[] } : undefined,
              labels: params.labels as Record<string, string> | undefined,
            },
          });
          return operation;
        },
      },
      {
        name: "gcp_compute_start",
        description: "Start a stopped Compute Engine instance.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Instance name." },
            zone: { type: "string", description: "Zone the instance is in." },
          },
          required: ["name", "zone"],
        },
        handler: async (params) => {
          const [operation] = await clients.computeInstances.start({
            project: config.projectId,
            instance: params.name as string,
            zone: params.zone as string,
          });
          return operation;
        },
      },
      {
        name: "gcp_compute_stop",
        description:
          "Stop a running Compute Engine instance. The instance is not deleted and can be started again.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Instance name." },
            zone: { type: "string", description: "Zone the instance is in." },
          },
          required: ["name", "zone"],
        },
        handler: async (params) => {
          const [operation] = await clients.computeInstances.stop({
            project: config.projectId,
            instance: params.name as string,
            zone: params.zone as string,
          });
          return operation;
        },
      },
      {
        name: "gcp_compute_delete",
        description:
          "Delete a Compute Engine instance. This is irreversible and the instance will be permanently removed.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Instance name." },
            zone: { type: "string", description: "Zone the instance is in." },
          },
          required: ["name", "zone"],
        },
        handler: async (params) => {
          const [operation] = await clients.computeInstances.delete({
            project: config.projectId,
            instance: params.name as string,
            zone: params.zone as string,
          });
          return { operation, rollback: { action: "create", instance: params.name } };
        },
      },
    ];
  },

  getConsolidatedTool(clients, config): Tool {
    const individualTools = computeResource.getTools(clients, config);
    const toolMap = new Map(individualTools.map((t) => [t.name, t]));

    return {
      name: "gcp_compute",
      description:
        "Manage GCP Compute Engine instances.\n\n" +
        "Actions:\n" +
        "- list: List all instances. Params: zone? (string), filter? (string)\n" +
        "- get: Get instance details. Params: name (string), zone (string)\n" +
        "- create: Create an instance. Params: name (string), zone (string), machineType? (string), sourceImage? (string), diskSizeGb? (number), network? (string), subnet? (string), tags? (string[]), labels? (object)\n" +
        "- start: Start a stopped instance. Params: name (string), zone (string)\n" +
        "- stop: Stop a running instance. Params: name (string), zone (string)\n" +
        "- delete: Delete an instance. Params: name (string), zone (string)",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "get", "create", "start", "stop", "delete"],
            description: "The action to perform.",
          },
          name: { type: "string", description: "Instance name." },
          zone: { type: "string", description: "Zone (e.g., 'us-central1-a')." },
          filter: { type: "string", description: "GCP filter expression (list only)." },
          machineType: { type: "string", description: "Machine type (e.g., 'e2-micro'). Defaults to 'e2-micro'. (create only)" },
          sourceImage: { type: "string", description: "Boot disk image. Defaults to Debian 12. (create only)" },
          diskSizeGb: { type: "number", description: "Boot disk size in GB. Defaults to 10. (create only)" },
          network: { type: "string", description: "VPC network name. Defaults to 'default'. (create only)" },
          subnet: { type: "string", description: "Subnet name. (create only)" },
          tags: { type: "array", items: { type: "string" }, description: "Network tags. (create only)" },
          labels: { type: "object", additionalProperties: { type: "string" }, description: "Labels. (create only)" },
        },
        required: ["action"],
      },
      handler: async (params) => {
        const action = params.action as string;
        const actionToTool: Record<string, string> = {
          list: "gcp_compute_list",
          get: "gcp_compute_get",
          create: "gcp_compute_create",
          start: "gcp_compute_start",
          stop: "gcp_compute_stop",
          delete: "gcp_compute_delete",
        };
        const toolName = actionToTool[action];
        if (!toolName) throw new Error(`Unknown action: ${action}`);
        const tool = toolMap.get(toolName);
        if (!tool) throw new Error(`Tool not found: ${toolName}`);
        const { action: _, ...rest } = params;
        return tool.handler(rest);
      },
    };
  },
};

function mapInstanceStatus(
  status: string,
): Resource["status"] {
  switch (status) {
    case "RUNNING":
      return "active";
    case "PROVISIONING":
    case "STAGING":
    case "STOPPING":
    case "SUSPENDING":
      return "pending";
    case "TERMINATED":
    case "SUSPENDED":
      return "active";
    default:
      return "unknown";
  }
}
