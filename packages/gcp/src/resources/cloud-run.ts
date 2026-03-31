import type { Resource, Tool } from "@terror/core/types.js";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface CloudRunResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
}

export const cloudRunResource: CloudRunResourceDefinition = {
  type: "cloud-run-service",

  async list(clients, config): Promise<Resource[]> {
    const parent = `projects/${config.projectId}/locations/${config.region}`;
    const [services] = await clients.cloudRun.listServices({ parent });

    return (services ?? []).map((service) => ({
      id: service.name ?? "",
      type: "cloud-run-service",
      provider: "gcp",
      name: service.name?.split("/").pop() ?? "",
      status: service.reconciling ? "pending" : "active",
      properties: {
        uri: service.uri,
        generation: service.generation,
        template: service.template,
        traffic: service.traffic,
        conditions: service.conditions,
      },
      createdAt: new Date(service.createTime?.seconds?.toString() ?? ""),
      updatedAt: new Date(service.updateTime?.seconds?.toString() ?? ""),
    }));
  },

  getTools(clients, config): Tool[] {
    return [
      {
        name: "gcp_cloud_run_list",
        description:
          "List Cloud Run services in the configured region. Returns service names, URLs, and status.",
        inputSchema: {
          type: "object",
          properties: {
            region: {
              type: "string",
              description: "Override the default region for this query.",
            },
          },
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const parent = `projects/${config.projectId}/locations/${region}`;
          const [services] = await clients.cloudRun.listServices({ parent });
          return (services ?? []).map((s) => ({
            name: s.name?.split("/").pop(),
            uri: s.uri,
            reconciling: s.reconciling,
          }));
        },
      },
      {
        name: "gcp_cloud_run_get",
        description: "Get detailed information about a specific Cloud Run service.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Service name." },
            region: { type: "string", description: "Region. Defaults to configured region." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const fullName = `projects/${config.projectId}/locations/${region}/services/${params.name as string}`;
          const [service] = await clients.cloudRun.getService({ name: fullName });
          return service;
        },
      },
      {
        name: "gcp_cloud_run_deploy",
        description:
          "Deploy a new Cloud Run service or update an existing one from a container image.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Service name." },
            image: {
              type: "string",
              description: "Container image URL (e.g., 'gcr.io/my-project/my-image:latest').",
            },
            region: { type: "string", description: "Region to deploy to." },
            port: {
              type: "number",
              description: "Container port. Defaults to 8080.",
            },
            env: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Environment variables as key-value pairs.",
            },
            memory: {
              type: "string",
              description: "Memory limit (e.g., '512Mi', '1Gi'). Defaults to '512Mi'.",
            },
            cpu: {
              type: "string",
              description: "CPU limit (e.g., '1', '2'). Defaults to '1'.",
            },
            maxInstances: {
              type: "number",
              description: "Maximum number of instances. Defaults to 100.",
            },
            allowUnauthenticated: {
              type: "boolean",
              description: "Allow unauthenticated access. Defaults to false.",
            },
          },
          required: ["name", "image"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const parent = `projects/${config.projectId}/locations/${region}`;
          const envVars = params.env as Record<string, string> | undefined;

          const serviceConfig = {
            parent,
            serviceId: params.name as string,
            service: {
              template: {
                containers: [
                  {
                    image: params.image as string,
                    ports: [{ containerPort: (params.port as number | undefined) ?? 8080 }],
                    env: envVars
                      ? Object.entries(envVars).map(([name, value]) => ({ name, value }))
                      : undefined,
                    resources: {
                      limits: {
                        memory: (params.memory as string | undefined) ?? "512Mi",
                        cpu: (params.cpu as string | undefined) ?? "1",
                      },
                    },
                  },
                ],
                scaling: {
                  maxInstanceCount: (params.maxInstances as number | undefined) ?? 100,
                },
              },
            },
          };

          const [operation] = await clients.cloudRun.createService(serviceConfig);
          // TODO: If allowUnauthenticated, set IAM policy to allow allUsers invoker role
          return operation;
        },
      },
      {
        name: "gcp_cloud_run_update",
        description:
          "Update an existing Cloud Run service (image, env vars, resources, scaling).",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Service name." },
            image: { type: "string", description: "New container image URL." },
            region: { type: "string", description: "Region." },
            env: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Environment variables to set (replaces all existing).",
            },
            memory: { type: "string", description: "Memory limit." },
            cpu: { type: "string", description: "CPU limit." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const fullName = `projects/${config.projectId}/locations/${region}/services/${params.name as string}`;

          const [existing] = await clients.cloudRun.getService({ name: fullName });
          const container = existing.template?.containers?.[0] ?? {};

          if (params.image) container.image = params.image as string;
          if (params.memory) {
            container.resources = container.resources ?? { limits: {} };
            container.resources.limits = container.resources.limits ?? {};
            container.resources.limits.memory = params.memory as string;
          }
          if (params.cpu) {
            container.resources = container.resources ?? { limits: {} };
            container.resources.limits = container.resources.limits ?? {};
            container.resources.limits.cpu = params.cpu as string;
          }
          if (params.env) {
            const envVars = params.env as Record<string, string>;
            container.env = Object.entries(envVars).map(([name, value]) => ({ name, value }));
          }

          const [operation] = await clients.cloudRun.updateService({
            service: existing,
          });
          return operation;
        },
      },
      {
        name: "gcp_cloud_run_delete",
        description: "Delete a Cloud Run service.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Service name." },
            region: { type: "string", description: "Region." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const region = (params.region as string | undefined) ?? config.region;
          const fullName = `projects/${config.projectId}/locations/${region}/services/${params.name as string}`;
          const [operation] = await clients.cloudRun.deleteService({ name: fullName });
          return { operation, rollback: { action: "deploy", service: params.name } };
        },
      },
    ];
  },
};
