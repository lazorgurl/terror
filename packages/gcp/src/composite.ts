import type { Tool } from "@terror/core";
import type { GcpClients } from "./client.js";
import type { GcpConfig } from "./provider.js";

export function getConsolidatedDeployTool(clients: GcpClients, config: GcpConfig): Tool {
  const staticSiteTool = deployStaticSite(clients, config);
  const cloudRunTool = deployCloudRunService(clients, config);
  const apiBackendTool = createApiBackend(clients, config);

  return {
    name: "gcp_deploy",
    description:
      "Deploy composite GCP infrastructure stacks.\n\n" +
      "Actions:\n" +
      "- static_site: Deploy a static website to Cloud Storage. Params: bucketName (string), files (array of {path, content, contentType}), mainPage? (string), notFoundPage? (string), location? (string)\n" +
      "- cloud_run_service: Deploy a Cloud Run service with IAM. Params: name (string), image (string), region? (string), port? (number), env? (object), memory? (string), cpu? (string), minInstances? (number), maxInstances? (number), allowUnauthenticated? (boolean), serviceAccount? (string)\n" +
      "- api_backend: Create Cloud Run + Pub/Sub + Cloud SQL backend. Params: name (string), image (string), databaseVersion? (string), dbTier? (string), region? (string), env? (object)",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["static_site", "cloud_run_service", "api_backend"],
          description: "The deployment type.",
        },
        name: { type: "string", description: "Service/resource base name." },
        bucketName: { type: "string", description: "Bucket name (static_site)." },
        files: { type: "array", description: "Files to upload [{path, content, contentType}] (static_site)." },
        mainPage: { type: "string", description: "Main page suffix (static_site)." },
        notFoundPage: { type: "string", description: "404 page (static_site)." },
        location: { type: "string", description: "Bucket location (static_site)." },
        image: { type: "string", description: "Container image URL." },
        region: { type: "string", description: "Region." },
        port: { type: "number", description: "Container port." },
        env: { type: "object", additionalProperties: { type: "string" }, description: "Environment variables." },
        memory: { type: "string", description: "Memory limit." },
        cpu: { type: "string", description: "CPU limit." },
        minInstances: { type: "number", description: "Min instances." },
        maxInstances: { type: "number", description: "Max instances." },
        allowUnauthenticated: { type: "boolean", description: "Allow public access." },
        serviceAccount: { type: "string", description: "Service account email." },
        databaseVersion: { type: "string", description: "Cloud SQL version (api_backend)." },
        dbTier: { type: "string", description: "Cloud SQL tier (api_backend)." },
      },
      required: ["action"],
    },
    handler: async (params) => {
      const action = params.action as string;
      const { action: _, ...rest } = params;
      switch (action) {
        case "static_site":
          return staticSiteTool.handler(rest);
        case "cloud_run_service":
          return cloudRunTool.handler(rest);
        case "api_backend":
          return apiBackendTool.handler(rest);
        default:
          throw new Error(`Unknown deploy action: ${action}`);
      }
    },
  };
}

export function deployStaticSite(clients: GcpClients, config: GcpConfig): Tool {
  return {
    name: "gcp_deploy_static_site",
    description:
      "Deploy a static website to Cloud Storage. Creates a bucket, uploads HTML/CSS/JS files, " +
      "configures the bucket for web hosting with a main page and 404 page, and sets public access. " +
      "Returns the public URL.",
    inputSchema: {
      type: "object",
      properties: {
        bucketName: {
          type: "string",
          description:
            "Globally unique bucket name. Typically the domain name (e.g., 'www.example.com').",
        },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Destination path in the bucket (e.g., 'index.html', 'css/style.css').",
              },
              content: {
                type: "string",
                description: "File content as a string.",
              },
              contentType: {
                type: "string",
                description: "MIME type (e.g., 'text/html', 'text/css', 'application/javascript').",
              },
            },
            required: ["path", "content", "contentType"],
          },
          description: "Files to upload to the bucket.",
        },
        mainPage: {
          type: "string",
          description: "Main page suffix. Defaults to 'index.html'.",
        },
        notFoundPage: {
          type: "string",
          description: "404 page. Defaults to '404.html'.",
        },
        location: {
          type: "string",
          description: "Bucket location. Defaults to configured region.",
        },
      },
      required: ["bucketName", "files"],
    },
    handler: async (params) => {
      const bucketName = params.bucketName as string;
      const files = params.files as Array<{
        path: string;
        content: string;
        contentType: string;
      }>;
      const mainPage = (params.mainPage as string | undefined) ?? "index.html";
      const notFoundPage = (params.notFoundPage as string | undefined) ?? "404.html";
      const location = (params.location as string | undefined) ?? config.region;

      const [bucket] = await clients.storage.createBucket(bucketName, {
        location,
        website: { mainPageSuffix: mainPage, notFoundPage },
        iamConfiguration: {
          uniformBucketLevelAccess: { enabled: true },
        },
      });

      await bucket.makePublic();

      const uploadResults = await Promise.all(
        files.map(async (file) => {
          const blob = bucket.file(file.path);
          await blob.save(file.content, { contentType: file.contentType });
          return { path: file.path, url: `https://storage.googleapis.com/${bucketName}/${file.path}` };
        }),
      );

      return {
        bucket: bucketName,
        url: `https://storage.googleapis.com/${bucketName}/${mainPage}`,
        files: uploadResults,
        rollback: { action: "delete_bucket", bucket: bucketName },
      };
    },
  };
}

export function deployCloudRunService(
  clients: GcpClients,
  config: GcpConfig,
): Tool {
  return {
    name: "gcp_deploy_cloud_run_full",
    description:
      "Deploy a complete Cloud Run service with IAM configuration. Creates or updates the service " +
      "from a container image, configures resource limits, environment variables, scaling, " +
      "and optionally allows unauthenticated access. Returns the service URL.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Service name." },
        image: {
          type: "string",
          description: "Container image URL (e.g., 'gcr.io/project/image:tag').",
        },
        region: { type: "string", description: "Region. Defaults to configured region." },
        port: { type: "number", description: "Container port. Defaults to 8080." },
        env: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Environment variables.",
        },
        memory: { type: "string", description: "Memory (e.g., '512Mi'). Defaults to '512Mi'." },
        cpu: { type: "string", description: "CPU (e.g., '1'). Defaults to '1'." },
        minInstances: {
          type: "number",
          description: "Minimum instances (0 for scale-to-zero). Defaults to 0.",
        },
        maxInstances: {
          type: "number",
          description: "Maximum instances. Defaults to 100.",
        },
        allowUnauthenticated: {
          type: "boolean",
          description: "Allow public access without authentication. Defaults to false.",
        },
        serviceAccount: {
          type: "string",
          description: "Service account email for the service to run as.",
        },
      },
      required: ["name", "image"],
    },
    handler: async (params) => {
      const region = (params.region as string | undefined) ?? config.region;
      const parent = `projects/${config.projectId}/locations/${region}`;
      const envVars = params.env as Record<string, string> | undefined;

      const [operation] = await clients.cloudRun.createService({
        parent,
        serviceId: params.name as string,
        service: {
          template: {
            serviceAccount: params.serviceAccount as string | undefined,
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
              minInstanceCount: (params.minInstances as number | undefined) ?? 0,
              maxInstanceCount: (params.maxInstances as number | undefined) ?? 100,
            },
          },
        },
      });

      // TODO: If allowUnauthenticated, set IAM policy on the service to grant
      // roles/run.invoker to allUsers. This requires the Run v2 setIamPolicy API.

      const serviceName = `${parent}/services/${params.name as string}`;
      const [service] = await clients.cloudRun.getService({ name: serviceName });

      return {
        name: params.name,
        url: service.uri,
        operation,
        rollback: { action: "delete_service", service: params.name, region },
      };
    },
  };
}

export function createApiBackend(clients: GcpClients, config: GcpConfig): Tool {
  return {
    name: "gcp_create_api_backend",
    description:
      "Create a complete API backend: Cloud Run service + Pub/Sub topic for async events + " +
      "Cloud SQL database for persistence. Configures the Cloud Run service with environment " +
      "variables pointing to the database and Pub/Sub topic.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Base name for all resources (used as prefix).",
        },
        image: {
          type: "string",
          description: "Container image URL for the Cloud Run service.",
        },
        databaseVersion: {
          type: "string",
          description: "Cloud SQL database version (e.g., 'POSTGRES_15'). Defaults to 'POSTGRES_15'.",
        },
        dbTier: {
          type: "string",
          description: "Cloud SQL machine tier. Defaults to 'db-f1-micro'.",
        },
        region: { type: "string", description: "Region. Defaults to configured region." },
        env: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Additional environment variables for the Cloud Run service.",
        },
      },
      required: ["name", "image"],
    },
    handler: async (params) => {
      const baseName = params.name as string;
      const region = (params.region as string | undefined) ?? config.region;
      const dbVersion =
        (params.databaseVersion as string | undefined) ?? "POSTGRES_15";
      const dbTier = (params.dbTier as string | undefined) ?? "db-f1-micro";
      const additionalEnv = (params.env as Record<string, string> | undefined) ?? {};

      const topicName = `${baseName}-events`;
      const [topic] = await clients.pubsub.createTopic({
        name: `projects/${config.projectId}/topics/${topicName}`,
      });

      const sqlInstanceName = `${baseName}-db`;
      const sqlResponse = await clients.sqladmin.instances.insert({
        project: config.projectId,
        requestBody: {
          name: sqlInstanceName,
          databaseVersion: dbVersion,
          region,
          settings: {
            tier: dbTier,
            dataDiskSizeGb: "10",
            dataDiskType: "PD_SSD",
            ipConfiguration: {
              ipv4Enabled: false,
            },
          },
        },
      });

      const connectionName = `${config.projectId}:${region}:${sqlInstanceName}`;
      const serviceEnv: Record<string, string> = {
        PUBSUB_TOPIC: topicName,
        DB_CONNECTION_NAME: connectionName,
        DB_NAME: baseName,
        GCP_PROJECT: config.projectId,
        ...additionalEnv,
      };

      const parent = `projects/${config.projectId}/locations/${region}`;
      const [serviceOperation] = await clients.cloudRun.createService({
        parent,
        serviceId: baseName,
        service: {
          template: {
            containers: [
              {
                image: params.image as string,
                ports: [{ containerPort: 8080 }],
                env: Object.entries(serviceEnv).map(([name, value]) => ({
                  name,
                  value,
                })),
                resources: {
                  limits: { memory: "512Mi", cpu: "1" },
                },
              },
            ],
          },
        },
      });

      const [service] = await clients.cloudRun.getService({
        name: `${parent}/services/${baseName}`,
      });

      return {
        service: { name: baseName, url: service.uri },
        topic: { name: topic.name },
        database: {
          name: sqlInstanceName,
          connectionName,
          operation: sqlResponse.data,
        },
        serviceOperation,
        rollback: {
          resources: [
            { action: "delete_service", service: baseName, region },
            { action: "delete_topic", topic: topicName },
            { action: "delete_sql_instance", instance: sqlInstanceName },
          ],
        },
      };
    },
  };
}
