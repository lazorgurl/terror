import type { Resource, Tool } from "@terror/core/types.js";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface StorageResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
}

export const storageResource: StorageResourceDefinition = {
  type: "storage-bucket",

  async list(clients, config): Promise<Resource[]> {
    const [buckets] = await clients.storage.getBuckets({
      project: config.projectId,
    });

    return buckets.map((bucket) => ({
      id: bucket.id ?? bucket.name ?? "",
      type: "storage-bucket",
      provider: "gcp",
      name: bucket.name ?? "",
      status: "active" as const,
      properties: {
        location: bucket.metadata?.location,
        storageClass: bucket.metadata?.storageClass,
        selfLink: bucket.metadata?.selfLink,
        versioning: bucket.metadata?.versioning,
      },
      createdAt: new Date(bucket.metadata?.timeCreated ?? ""),
      updatedAt: new Date(bucket.metadata?.updated ?? ""),
    }));
  },

  getTools(clients, config): Tool[] {
    return [
      {
        name: "gcp_storage_bucket_list",
        description: "List all Cloud Storage buckets in the project.",
        inputSchema: {
          type: "object",
          properties: {
            prefix: {
              type: "string",
              description: "Filter buckets by name prefix.",
            },
          },
        },
        handler: async (params) => {
          return storageResource.list(clients, config);
        },
      },
      {
        name: "gcp_storage_bucket_get",
        description: "Get metadata for a specific Cloud Storage bucket.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Bucket name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [metadata] = await clients.storage
            .bucket(params.name as string)
            .getMetadata();
          return metadata;
        },
      },
      {
        name: "gcp_storage_bucket_create",
        description:
          "Create a new Cloud Storage bucket. Specify location, storage class, and access settings.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Globally unique bucket name." },
            location: {
              type: "string",
              description: "Bucket location (e.g., 'US', 'us-central1'). Defaults to project region.",
            },
            storageClass: {
              type: "string",
              enum: ["STANDARD", "NEARLINE", "COLDLINE", "ARCHIVE"],
              description: "Storage class. Defaults to STANDARD.",
            },
            uniformBucketLevelAccess: {
              type: "boolean",
              description: "Enable uniform bucket-level access. Defaults to true.",
            },
            publicAccess: {
              type: "boolean",
              description: "Make the bucket publicly readable. Defaults to false.",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [bucket] = await clients.storage.createBucket(
            params.name as string,
            {
              location: (params.location as string | undefined) ?? config.region,
              storageClass: (params.storageClass as string | undefined) ?? "STANDARD",
              iamConfiguration: {
                uniformBucketLevelAccess: {
                  enabled: (params.uniformBucketLevelAccess as boolean | undefined) ?? true,
                },
              },
            },
          );
          if (params.publicAccess) {
            await bucket.makePublic();
          }
          return { name: bucket.name, metadata: bucket.metadata };
        },
      },
      {
        name: "gcp_storage_bucket_update",
        description: "Update a Cloud Storage bucket's metadata (labels, versioning, lifecycle rules).",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Bucket name." },
            versioning: {
              type: "boolean",
              description: "Enable or disable object versioning.",
            },
            labels: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Labels to set on the bucket.",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const bucket = clients.storage.bucket(params.name as string);
          const metadata: Record<string, unknown> = {};
          if (params.versioning !== undefined) {
            metadata.versioning = { enabled: params.versioning };
          }
          if (params.labels) {
            metadata.labels = params.labels;
          }
          const [updated] = await bucket.setMetadata(metadata);
          return updated;
        },
      },
      {
        name: "gcp_storage_bucket_delete",
        description:
          "Delete a Cloud Storage bucket. The bucket must be empty unless force is set.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Bucket name." },
            force: {
              type: "boolean",
              description: "Delete all objects in the bucket first. Defaults to false.",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const bucket = clients.storage.bucket(params.name as string);
          if (params.force) {
            await bucket.deleteFiles({ force: true });
          }
          await bucket.delete();
          return { deleted: params.name };
        },
      },
      {
        name: "gcp_storage_object_list",
        description: "List objects in a Cloud Storage bucket.",
        inputSchema: {
          type: "object",
          properties: {
            bucket: { type: "string", description: "Bucket name." },
            prefix: {
              type: "string",
              description: "Filter objects by prefix (simulates directory listing).",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of objects to return. Defaults to 100.",
            },
          },
          required: ["bucket"],
        },
        handler: async (params) => {
          const [files] = await clients.storage
            .bucket(params.bucket as string)
            .getFiles({
              prefix: params.prefix as string | undefined,
              maxResults: (params.maxResults as number | undefined) ?? 100,
            });
          return files.map((f) => ({
            name: f.name,
            size: f.metadata.size,
            contentType: f.metadata.contentType,
            updated: f.metadata.updated,
          }));
        },
      },
      {
        name: "gcp_storage_object_get",
        description: "Get metadata for a specific object in a Cloud Storage bucket.",
        inputSchema: {
          type: "object",
          properties: {
            bucket: { type: "string", description: "Bucket name." },
            object: { type: "string", description: "Object name (full path including prefix)." },
          },
          required: ["bucket", "object"],
        },
        handler: async (params) => {
          const [metadata] = await clients.storage
            .bucket(params.bucket as string)
            .file(params.object as string)
            .getMetadata();
          return metadata;
        },
      },
      {
        name: "gcp_storage_object_upload",
        description: "Upload content to a Cloud Storage object.",
        inputSchema: {
          type: "object",
          properties: {
            bucket: { type: "string", description: "Bucket name." },
            destination: { type: "string", description: "Destination object path." },
            content: { type: "string", description: "String content to upload." },
            contentType: {
              type: "string",
              description: "MIME type (e.g., 'text/html'). Auto-detected if omitted.",
            },
          },
          required: ["bucket", "destination", "content"],
        },
        handler: async (params) => {
          const file = clients.storage
            .bucket(params.bucket as string)
            .file(params.destination as string);
          await file.save(params.content as string, {
            contentType: params.contentType as string | undefined,
          });
          const [metadata] = await file.getMetadata();
          return metadata;
        },
      },
      {
        name: "gcp_storage_object_delete",
        description: "Delete an object from a Cloud Storage bucket.",
        inputSchema: {
          type: "object",
          properties: {
            bucket: { type: "string", description: "Bucket name." },
            object: { type: "string", description: "Object name to delete." },
          },
          required: ["bucket", "object"],
        },
        handler: async (params) => {
          await clients.storage
            .bucket(params.bucket as string)
            .file(params.object as string)
            .delete();
          return { deleted: `${params.bucket}/${params.object}` };
        },
      },
    ];
  },
};
