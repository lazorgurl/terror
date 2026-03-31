import type { Resource, Tool } from "@terror/core";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface CloudSqlResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
  getConsolidatedTool(clients: GcpClients, config: GcpConfig): Tool;
}

export const cloudSqlResource: CloudSqlResourceDefinition = {
  type: "cloud-sql-instance",

  async list(clients, config): Promise<Resource[]> {
    const response = await clients.sqladmin.instances.list({
      project: config.projectId,
    });

    return (response.data.items ?? []).map((instance) => ({
      id: instance.name ?? "",
      type: "cloud-sql-instance",
      provider: "gcp",
      name: instance.name ?? "",
      status: mapSqlState(instance.state ?? ""),
      properties: {
        databaseVersion: instance.databaseVersion,
        region: instance.region,
        tier: instance.settings?.tier,
        ipAddresses: instance.ipAddresses,
        connectionName: instance.connectionName,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  },

  getTools(clients, config): Tool[] {
    return [
      {
        name: "gcp_sql_list",
        description: "List all Cloud SQL instances in the project.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          const response = await clients.sqladmin.instances.list({
            project: config.projectId,
          });
          return (response.data.items ?? []).map((i) => ({
            name: i.name,
            databaseVersion: i.databaseVersion,
            state: i.state,
            region: i.region,
            tier: i.settings?.tier,
          }));
        },
      },
      {
        name: "gcp_sql_get",
        description: "Get detailed information about a specific Cloud SQL instance.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Instance name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const response = await clients.sqladmin.instances.get({
            project: config.projectId,
            instance: params.name as string,
          });
          return response.data;
        },
      },
      {
        name: "gcp_sql_create",
        description:
          "Create a new Cloud SQL instance. Supports MySQL, PostgreSQL, and SQL Server.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Instance name." },
            databaseVersion: {
              type: "string",
              description:
                "Database version (e.g., 'POSTGRES_15', 'MYSQL_8_0', 'SQLSERVER_2022_STANDARD').",
            },
            tier: {
              type: "string",
              description:
                "Machine type tier (e.g., 'db-f1-micro', 'db-custom-2-8192'). Defaults to 'db-f1-micro'.",
            },
            region: {
              type: "string",
              description: "Region. Defaults to configured region.",
            },
            storageSize: {
              type: "number",
              description: "Storage size in GB. Defaults to 10.",
            },
            storageType: {
              type: "string",
              enum: ["PD_SSD", "PD_HDD"],
              description: "Storage type. Defaults to PD_SSD.",
            },
            availability: {
              type: "string",
              enum: ["ZONAL", "REGIONAL"],
              description: "Availability type. REGIONAL enables high availability. Defaults to ZONAL.",
            },
            enablePublicIp: {
              type: "boolean",
              description: "Assign a public IP. Defaults to false.",
            },
            rootPassword: {
              type: "string",
              description: "Root password for the database.",
            },
          },
          required: ["name", "databaseVersion"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const response = await clients.sqladmin.instances.insert({
            project: config.projectId,
            requestBody: {
              name: params.name as string,
              databaseVersion: params.databaseVersion as string,
              region,
              rootPassword: params.rootPassword as string | undefined,
              settings: {
                tier: (params.tier as string | undefined) ?? "db-f1-micro",
                dataDiskSizeGb: ((params.storageSize as number | undefined) ?? 10).toString(),
                dataDiskType: (params.storageType as string | undefined) ?? "PD_SSD",
                availabilityType:
                  (params.availability as string | undefined) ?? "ZONAL",
                ipConfiguration: {
                  ipv4Enabled: (params.enablePublicIp as boolean | undefined) ?? false,
                },
              },
            },
          });
          return response.data;
        },
      },
      {
        name: "gcp_sql_update",
        description: "Update a Cloud SQL instance's configuration (tier, storage, flags).",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Instance name." },
            tier: { type: "string", description: "New machine type tier." },
            storageSize: { type: "number", description: "New storage size in GB." },
            availability: {
              type: "string",
              enum: ["ZONAL", "REGIONAL"],
              description: "New availability type.",
            },
            databaseFlags: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  value: { type: "string" },
                },
                required: ["name", "value"],
              },
              description: "Database flags to set.",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const settings: Record<string, unknown> = {};
          if (params.tier) settings.tier = params.tier;
          if (params.storageSize) settings.dataDiskSizeGb = (params.storageSize as number).toString();
          if (params.availability) settings.availabilityType = params.availability;
          if (params.databaseFlags) settings.databaseFlags = params.databaseFlags;

          const response = await clients.sqladmin.instances.patch({
            project: config.projectId,
            instance: params.name as string,
            requestBody: { settings },
          });
          return response.data;
        },
      },
      {
        name: "gcp_sql_delete",
        description: "Delete a Cloud SQL instance. This is irreversible.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Instance name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const response = await clients.sqladmin.instances.delete({
            project: config.projectId,
            instance: params.name as string,
          });
          return { operation: response.data, rollback: { action: "create", instance: params.name } };
        },
      },
    ];
  },

  getConsolidatedTool(clients, config): Tool {
    const individualTools = cloudSqlResource.getTools(clients, config);
    const toolMap = new Map(individualTools.map((t) => [t.name, t]));

    return {
      name: "gcp_cloud_sql",
      description:
        "Manage GCP Cloud SQL instances.\n\n" +
        "Actions:\n" +
        "- list: List all instances.\n" +
        "- get: Get instance details. Params: name (string)\n" +
        "- create: Create an instance. Params: name (string), databaseVersion (string), tier? (string), region? (string), storageSize? (number), storageType? (PD_SSD|PD_HDD), availability? (ZONAL|REGIONAL), enablePublicIp? (boolean), rootPassword? (string)\n" +
        "- update: Update an instance. Params: name (string), tier? (string), storageSize? (number), availability? (ZONAL|REGIONAL), databaseFlags? (array)\n" +
        "- delete: Delete an instance. Params: name (string)",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "get", "create", "update", "delete"],
            description: "The action to perform.",
          },
          name: { type: "string", description: "Instance name." },
          databaseVersion: { type: "string", description: "Database version (e.g., 'POSTGRES_15')." },
          tier: { type: "string", description: "Machine type tier." },
          region: { type: "string", description: "Region." },
          storageSize: { type: "number", description: "Storage size in GB." },
          storageType: { type: "string", enum: ["PD_SSD", "PD_HDD"], description: "Storage type." },
          availability: { type: "string", enum: ["ZONAL", "REGIONAL"], description: "Availability type." },
          enablePublicIp: { type: "boolean", description: "Assign a public IP." },
          rootPassword: { type: "string", description: "Root password." },
          databaseFlags: { type: "array", items: { type: "object" }, description: "Database flags [{name, value}]." },
        },
        required: ["action"],
      },
      handler: async (params) => {
        const action = params.action as string;
        const actionToTool: Record<string, string> = {
          list: "gcp_sql_list",
          get: "gcp_sql_get",
          create: "gcp_sql_create",
          update: "gcp_sql_update",
          delete: "gcp_sql_delete",
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

function mapSqlState(state: string): Resource["status"] {
  switch (state) {
    case "RUNNABLE":
      return "active";
    case "PENDING_CREATE":
    case "MAINTENANCE":
    case "PENDING_DELETE":
      return "pending";
    case "FAILED":
    case "SUSPENDED":
      return "error";
    default:
      return "unknown";
  }
}
