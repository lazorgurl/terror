import type { Resource, Tool } from "@terror/core";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface NetworkResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
}

export const networkResource: NetworkResourceDefinition = {
  type: "vpc-network",

  async list(clients, config): Promise<Resource[]> {
    const [networks] = await clients.networks.list({
      project: config.projectId,
    });

    return (networks ?? []).map((network) => ({
      id: network.id?.toString() ?? "",
      type: "vpc-network",
      provider: "gcp",
      name: network.name ?? "",
      status: "active" as const,
      properties: {
        autoCreateSubnetworks: network.autoCreateSubnetworks,
        subnetworks: network.subnetworks,
        routingConfig: network.routingConfig,
        selfLink: network.selfLink,
      },
      createdAt: new Date(network.creationTimestamp ?? ""),
      updatedAt: new Date(),
    }));
  },

  getTools(clients, config): Tool[] {
    return [
      {
        name: "gcp_network_vpc_list",
        description: "List all VPC networks in the project.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          const [networks] = await clients.networks.list({
            project: config.projectId,
          });
          return (networks ?? []).map((n) => ({
            name: n.name,
            autoCreateSubnetworks: n.autoCreateSubnetworks,
            subnetworkCount: n.subnetworks?.length ?? 0,
          }));
        },
      },
      {
        name: "gcp_network_vpc_get",
        description: "Get detailed information about a specific VPC network.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "VPC network name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [network] = await clients.networks.get({
            project: config.projectId,
            network: params.name as string,
          });
          return network;
        },
      },
      {
        name: "gcp_network_vpc_create",
        description: "Create a new VPC network.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Network name." },
            autoCreateSubnetworks: {
              type: "boolean",
              description:
                "Automatically create subnets in each region. Defaults to false (custom mode).",
            },
            routingMode: {
              type: "string",
              enum: ["REGIONAL", "GLOBAL"],
              description: "Routing mode. Defaults to REGIONAL.",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [operation] = await clients.networks.insert({
            project: config.projectId,
            networkResource: {
              name: params.name as string,
              autoCreateSubnetworks:
                (params.autoCreateSubnetworks as boolean | undefined) ?? false,
              routingConfig: {
                routingMode:
                  (params.routingMode as string | undefined) ?? "REGIONAL",
              },
            },
          });
          return operation;
        },
      },
      {
        name: "gcp_network_vpc_update",
        description: "Update a VPC network's routing mode.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Network name." },
            routingMode: {
              type: "string",
              enum: ["REGIONAL", "GLOBAL"],
              description: "New routing mode.",
            },
          },
          required: ["name", "routingMode"],
        },
        handler: async (params) => {
          const [operation] = await clients.networks.patch({
            project: config.projectId,
            network: params.name as string,
            networkResource: {
              routingConfig: {
                routingMode: params.routingMode as string,
              },
            },
          });
          return operation;
        },
      },
      {
        name: "gcp_network_vpc_delete",
        description:
          "Delete a VPC network. All subnets and firewall rules must be deleted first.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Network name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [operation] = await clients.networks.delete({
            project: config.projectId,
            network: params.name as string,
          });
          return { operation, rollback: { action: "create", network: params.name } };
        },
      },
      {
        name: "gcp_network_subnet_list",
        description: "List all subnets in the project, optionally filtered by region.",
        inputSchema: {
          type: "object",
          properties: {
            region: {
              type: "string",
              description: "Filter by region. If omitted, lists across all regions.",
            },
          },
        },
        handler: async (params) => {
          if (params.region) {
            const [subnets] = await clients.subnetworks.list({
              project: config.projectId,
              region: params.region as string,
            });
            return (subnets ?? []).map((s) => ({
              name: s.name,
              network: s.network?.split("/").pop(),
              ipCidrRange: s.ipCidrRange,
              region: s.region,
            }));
          }
          const iterable = clients.subnetworks.aggregatedListAsync({
            project: config.projectId,
          });
          const results: Array<{ name: string | null | undefined; network: string | undefined; ipCidrRange: string | null | undefined; region: string | null | undefined }> = [];
          for await (const [, scopedList] of iterable) {
            for (const s of scopedList.subnetworks ?? []) {
              results.push({
                name: s.name,
                network: s.network?.split("/").pop(),
                ipCidrRange: s.ipCidrRange,
                region: s.region,
              });
            }
          }
          return results;
        },
      },
      {
        name: "gcp_network_subnet_get",
        description: "Get detailed information about a specific subnet.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Subnet name." },
            region: { type: "string", description: "Region the subnet is in." },
          },
          required: ["name", "region"],
        },
        handler: async (params) => {
          const [subnet] = await clients.subnetworks.get({
            project: config.projectId,
            region: params.region as string,
            subnetwork: params.name as string,
          });
          return subnet;
        },
      },
      {
        name: "gcp_network_subnet_create",
        description: "Create a new subnet in a VPC network.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Subnet name." },
            network: { type: "string", description: "VPC network name." },
            region: { type: "string", description: "Region for the subnet." },
            ipCidrRange: {
              type: "string",
              description: "IP CIDR range (e.g., '10.0.0.0/24').",
            },
            privateIpGoogleAccess: {
              type: "boolean",
              description: "Enable private Google access. Defaults to false.",
            },
          },
          required: ["name", "network", "region", "ipCidrRange"],
        },
        handler: async (params) => {
          const [operation] = await clients.subnetworks.insert({
            project: config.projectId,
            region: params.region as string,
            subnetworkResource: {
              name: params.name as string,
              network: `projects/${config.projectId}/global/networks/${params.network as string}`,
              ipCidrRange: params.ipCidrRange as string,
              privateIpGoogleAccess:
                (params.privateIpGoogleAccess as boolean | undefined) ?? false,
            },
          });
          return operation;
        },
      },
      {
        name: "gcp_network_subnet_update",
        description: "Update a subnet (e.g., expand IP range, toggle private Google access).",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Subnet name." },
            region: { type: "string", description: "Region." },
            privateIpGoogleAccess: {
              type: "boolean",
              description: "Enable or disable private Google access.",
            },
          },
          required: ["name", "region"],
        },
        handler: async (params) => {
          if (params.privateIpGoogleAccess !== undefined) {
            const [operation] =
              await clients.subnetworks.setPrivateIpGoogleAccess({
                project: config.projectId,
                region: params.region as string,
                subnetwork: params.name as string,
                subnetworksSetPrivateIpGoogleAccessRequestResource: {
                  privateIpGoogleAccess: params.privateIpGoogleAccess as boolean,
                },
              });
            return operation;
          }
          return { message: "No update parameters provided." };
        },
      },
      {
        name: "gcp_network_subnet_delete",
        description: "Delete a subnet.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Subnet name." },
            region: { type: "string", description: "Region." },
          },
          required: ["name", "region"],
        },
        handler: async (params) => {
          const [operation] = await clients.subnetworks.delete({
            project: config.projectId,
            region: params.region as string,
            subnetwork: params.name as string,
          });
          return { operation, rollback: { action: "create", subnet: params.name } };
        },
      },
      {
        name: "gcp_network_firewall_list",
        description: "List all firewall rules in the project.",
        inputSchema: {
          type: "object",
          properties: {
            network: {
              type: "string",
              description: "Filter by VPC network name.",
            },
          },
        },
        handler: async (params) => {
          const [firewalls] = await clients.firewalls.list({
            project: config.projectId,
            filter: params.network
              ? `network="https://www.googleapis.com/compute/v1/projects/${config.projectId}/global/networks/${params.network as string}"`
              : undefined,
          });
          return (firewalls ?? []).map((f) => ({
            name: f.name,
            network: f.network?.split("/").pop(),
            direction: f.direction,
            priority: f.priority,
            allowed: f.allowed,
            denied: f.denied,
            sourceRanges: f.sourceRanges,
            targetTags: f.targetTags,
          }));
        },
      },
      {
        name: "gcp_network_firewall_get",
        description: "Get details for a specific firewall rule.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Firewall rule name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [firewall] = await clients.firewalls.get({
            project: config.projectId,
            firewall: params.name as string,
          });
          return firewall;
        },
      },
      {
        name: "gcp_network_firewall_create",
        description:
          "Create a firewall rule. Define allowed/denied protocols and ports, source ranges, and target tags.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Firewall rule name." },
            network: { type: "string", description: "VPC network name. Defaults to 'default'." },
            direction: {
              type: "string",
              enum: ["INGRESS", "EGRESS"],
              description: "Traffic direction. Defaults to INGRESS.",
            },
            priority: {
              type: "number",
              description: "Priority (0-65535, lower = higher priority). Defaults to 1000.",
            },
            allowed: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  IPProtocol: { type: "string", description: "Protocol (tcp, udp, icmp, etc.)." },
                  ports: {
                    type: "array",
                    items: { type: "string" },
                    description: "Port ranges (e.g., ['80', '443', '8000-9000']).",
                  },
                },
                required: ["IPProtocol"],
              },
              description: "Allowed protocol/port combinations.",
            },
            denied: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  IPProtocol: { type: "string" },
                  ports: { type: "array", items: { type: "string" } },
                },
                required: ["IPProtocol"],
              },
              description: "Denied protocol/port combinations.",
            },
            sourceRanges: {
              type: "array",
              items: { type: "string" },
              description: "Source IP CIDR ranges (e.g., ['0.0.0.0/0']). For INGRESS rules.",
            },
            targetTags: {
              type: "array",
              items: { type: "string" },
              description: "Target instance tags this rule applies to.",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const network = (params.network as string | undefined) ?? "default";
          const [operation] = await clients.firewalls.insert({
            project: config.projectId,
            firewallResource: {
              name: params.name as string,
              network: `projects/${config.projectId}/global/networks/${network}`,
              direction: (params.direction as string | undefined) ?? "INGRESS",
              priority: (params.priority as number | undefined) ?? 1000,
              allowed: params.allowed as Array<{ IPProtocol: string; ports?: string[] }> | undefined,
              denied: params.denied as Array<{ IPProtocol: string; ports?: string[] }> | undefined,
              sourceRanges: params.sourceRanges as string[] | undefined,
              targetTags: params.targetTags as string[] | undefined,
            },
          });
          return operation;
        },
      },
      {
        name: "gcp_network_firewall_update",
        description: "Update a firewall rule's allowed/denied rules, source ranges, or priority.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Firewall rule name." },
            priority: { type: "number", description: "New priority." },
            allowed: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  IPProtocol: { type: "string" },
                  ports: { type: "array", items: { type: "string" } },
                },
                required: ["IPProtocol"],
              },
              description: "New allowed rules (replaces existing).",
            },
            sourceRanges: {
              type: "array",
              items: { type: "string" },
              description: "New source ranges.",
            },
            targetTags: {
              type: "array",
              items: { type: "string" },
              description: "New target tags.",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [operation] = await clients.firewalls.patch({
            project: config.projectId,
            firewall: params.name as string,
            firewallResource: {
              priority: params.priority as number | undefined,
              allowed: params.allowed as Array<{ IPProtocol: string; ports?: string[] }> | undefined,
              sourceRanges: params.sourceRanges as string[] | undefined,
              targetTags: params.targetTags as string[] | undefined,
            },
          });
          return operation;
        },
      },
      {
        name: "gcp_network_firewall_delete",
        description: "Delete a firewall rule.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Firewall rule name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [operation] = await clients.firewalls.delete({
            project: config.projectId,
            firewall: params.name as string,
          });
          return { operation, rollback: { action: "create", firewall: params.name } };
        },
      },
    ];
  },
};
