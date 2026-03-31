import type { Resource, Tool } from "@terror/core/types.js";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface CloudFunctionsResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
}

export const cloudFunctionsResource: CloudFunctionsResourceDefinition = {
  type: "cloud-function",

  async list(clients, config): Promise<Resource[]> {
    const parent = `projects/${config.projectId}/locations/${config.region}`;
    const [functions] = await clients.cloudFunctions.listFunctions({ parent });

    return (functions ?? []).map((fn) => ({
      id: fn.name ?? "",
      type: "cloud-function",
      provider: "gcp",
      name: fn.name?.split("/").pop() ?? "",
      status: mapFunctionState(fn.state ?? 0),
      properties: {
        runtime: fn.buildConfig?.runtime,
        entryPoint: fn.buildConfig?.entryPoint,
        url: fn.serviceConfig?.uri,
        environment: fn.environment,
        state: fn.state,
      },
      createdAt: new Date(fn.createTime?.seconds?.toString() ?? ""),
      updatedAt: new Date(fn.updateTime?.seconds?.toString() ?? ""),
    }));
  },

  getTools(clients, config): Tool[] {
    return [
      {
        name: "gcp_functions_list",
        description:
          "List Cloud Functions in the configured region. Returns function names, runtimes, and state.",
        inputSchema: {
          type: "object",
          properties: {
            region: { type: "string", description: "Override the default region." },
          },
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const parent = `projects/${config.projectId}/locations/${region}`;
          const [functions] = await clients.cloudFunctions.listFunctions({ parent });
          return (functions ?? []).map((fn) => ({
            name: fn.name?.split("/").pop(),
            runtime: fn.buildConfig?.runtime,
            state: fn.state,
            url: fn.serviceConfig?.uri,
          }));
        },
      },
      {
        name: "gcp_functions_get",
        description: "Get detailed information about a specific Cloud Function.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Function name." },
            region: { type: "string", description: "Region." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const fullName = `projects/${config.projectId}/locations/${region}/functions/${params.name as string}`;
          const [fn] = await clients.cloudFunctions.getFunction({ name: fullName });
          return fn;
        },
      },
      {
        name: "gcp_functions_deploy",
        description:
          "Deploy a new Cloud Function (2nd gen). Specify source, runtime, entry point, and trigger.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Function name." },
            runtime: {
              type: "string",
              description: "Runtime (e.g., 'nodejs20', 'python312', 'go122').",
            },
            entryPoint: {
              type: "string",
              description: "Function entry point name.",
            },
            sourceArchiveUrl: {
              type: "string",
              description:
                "GCS URL of the source archive (gs://bucket/source.zip).",
            },
            triggerType: {
              type: "string",
              enum: ["http", "pubsub", "storage"],
              description: "Trigger type. Defaults to 'http'.",
            },
            triggerResource: {
              type: "string",
              description:
                "Trigger resource (Pub/Sub topic name or Storage bucket name). Required for non-HTTP triggers.",
            },
            region: { type: "string", description: "Region to deploy to." },
            memory: {
              type: "string",
              description: "Memory limit (e.g., '256M', '1G'). Defaults to '256M'.",
            },
            timeout: {
              type: "number",
              description: "Timeout in seconds. Defaults to 60.",
            },
            env: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Environment variables.",
            },
          },
          required: ["name", "runtime", "entryPoint", "sourceArchiveUrl"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const parent = `projects/${config.projectId}/locations/${region}`;
          const triggerType = (params.triggerType as string | undefined) ?? "http";
          const envVars = params.env as Record<string, string> | undefined;

          // TODO: Build the trigger configuration based on triggerType
          // For HTTP: eventTrigger is omitted, httpsTrigger is set
          // For Pub/Sub: eventTrigger with pubsub topic
          // For Storage: eventTrigger with storage bucket

          const [operation] = await clients.cloudFunctions.createFunction({
            parent,
            functionId: params.name as string,
            function: {
              buildConfig: {
                runtime: params.runtime as string,
                entryPoint: params.entryPoint as string,
                source: {
                  storageSource: {
                    bucket: (params.sourceArchiveUrl as string).replace("gs://", "").split("/")[0],
                    object: (params.sourceArchiveUrl as string).replace("gs://", "").split("/").slice(1).join("/"),
                  },
                },
              },
              serviceConfig: {
                availableMemory: (params.memory as string | undefined) ?? "256M",
                timeoutSeconds: (params.timeout as number | undefined) ?? 60,
                environmentVariables: envVars,
              },
              ...(triggerType === "http"
                ? {}
                : {
                    eventTrigger: {
                      eventType:
                        triggerType === "pubsub"
                          ? "google.cloud.pubsub.topic.v1.messagePublished"
                          : "google.cloud.storage.object.v1.finalized",
                      pubsubTopic:
                        triggerType === "pubsub"
                          ? `projects/${config.projectId}/topics/${params.triggerResource as string}`
                          : undefined,
                    },
                  }),
            },
          });
          return operation;
        },
      },
      {
        name: "gcp_functions_update",
        description: "Update an existing Cloud Function's configuration.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Function name." },
            region: { type: "string", description: "Region." },
            runtime: { type: "string", description: "New runtime version." },
            entryPoint: { type: "string", description: "New entry point." },
            memory: { type: "string", description: "New memory limit." },
            timeout: { type: "number", description: "New timeout in seconds." },
            env: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "New environment variables (replaces all existing).",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const fullName = `projects/${config.projectId}/locations/${region}/functions/${params.name as string}`;

          const [existing] = await clients.cloudFunctions.getFunction({ name: fullName });

          if (params.runtime && existing.buildConfig) {
            existing.buildConfig.runtime = params.runtime as string;
          }
          if (params.entryPoint && existing.buildConfig) {
            existing.buildConfig.entryPoint = params.entryPoint as string;
          }
          if (params.memory && existing.serviceConfig) {
            existing.serviceConfig.availableMemory = params.memory as string;
          }
          if (params.timeout && existing.serviceConfig) {
            existing.serviceConfig.timeoutSeconds = params.timeout as number;
          }
          if (params.env && existing.serviceConfig) {
            existing.serviceConfig.environmentVariables = params.env as Record<string, string>;
          }

          const [operation] = await clients.cloudFunctions.updateFunction({
            function: existing,
          });
          return operation;
        },
      },
      {
        name: "gcp_functions_delete",
        description: "Delete a Cloud Function.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Function name." },
            region: { type: "string", description: "Region." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const fullName = `projects/${config.projectId}/locations/${region}/functions/${params.name as string}`;
          const [operation] = await clients.cloudFunctions.deleteFunction({ name: fullName });
          return { operation, rollback: { action: "deploy", function: params.name } };
        },
      },
    ];
  },
};

function mapFunctionState(state: number | string): Resource["status"] {
  switch (state) {
    case 1: // ACTIVE
    case "ACTIVE":
      return "active";
    case 2: // FAILED
    case "FAILED":
      return "error";
    case 3: // DEPLOYING
    case "DEPLOYING":
    case 4: // DELETING
    case "DELETING":
      return "pending";
    default:
      return "unknown";
  }
}
