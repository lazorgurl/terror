import type { Resource, Tool } from "@terror/core/types.js";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface PubsubResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
}

export const pubsubResource: PubsubResourceDefinition = {
  type: "pubsub-topic",

  async list(clients): Promise<Resource[]> {
    const [topics] = await clients.pubsub.getTopics();
    return topics.map((topic) => ({
      id: topic.name ?? "",
      type: "pubsub-topic",
      provider: "gcp",
      name: topic.name?.split("/").pop() ?? "",
      status: "active" as const,
      properties: {
        name: topic.name,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  },

  getTools(clients, config): Tool[] {
    return [
      {
        name: "gcp_pubsub_topic_list",
        description: "List all Pub/Sub topics in the project.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          const [topics] = await clients.pubsub.getTopics();
          return topics.map((t) => ({
            name: t.name?.split("/").pop(),
            fullName: t.name,
          }));
        },
      },
      {
        name: "gcp_pubsub_topic_get",
        description: "Get metadata for a specific Pub/Sub topic.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Topic name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const topic = clients.pubsub.topic(params.name as string);
          const [metadata] = await topic.getMetadata();
          return metadata;
        },
      },
      {
        name: "gcp_pubsub_topic_create",
        description: "Create a new Pub/Sub topic.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Topic name." },
            labels: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Labels for the topic.",
            },
            messageRetentionDuration: {
              type: "string",
              description:
                "How long to retain messages (e.g., '86400s' for 1 day). Defaults to no retention.",
            },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const [topic] = await clients.pubsub.createTopic({
            name: `projects/${config.projectId}/topics/${params.name as string}`,
            labels: params.labels as Record<string, string> | undefined,
            messageRetentionDuration: params.messageRetentionDuration
              ? { seconds: parseInt(params.messageRetentionDuration as string, 10) }
              : undefined,
          });
          return { name: topic.name };
        },
      },
      {
        name: "gcp_pubsub_topic_delete",
        description: "Delete a Pub/Sub topic. All subscriptions to this topic will also be deleted.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Topic name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const topic = clients.pubsub.topic(params.name as string);
          await topic.delete();
          return { deleted: params.name, rollback: { action: "create", topic: params.name } };
        },
      },
      {
        name: "gcp_pubsub_subscription_list",
        description: "List all subscriptions for a Pub/Sub topic.",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "Topic name. If omitted, lists all subscriptions in the project.",
            },
          },
        },
        handler: async (params) => {
          if (params.topic) {
            const topic = clients.pubsub.topic(params.topic as string);
            const [subscriptions] = await topic.getSubscriptions();
            return subscriptions.map((s) => ({
              name: s.name?.split("/").pop(),
              fullName: s.name,
            }));
          }
          const [subscriptions] = await clients.pubsub.getSubscriptions();
          return subscriptions.map((s) => ({
            name: s.name?.split("/").pop(),
            fullName: s.name,
          }));
        },
      },
      {
        name: "gcp_pubsub_subscription_get",
        description: "Get metadata for a specific Pub/Sub subscription.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Subscription name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const subscription = clients.pubsub.subscription(params.name as string);
          const [metadata] = await subscription.getMetadata();
          return metadata;
        },
      },
      {
        name: "gcp_pubsub_subscription_create",
        description: "Create a subscription to a Pub/Sub topic.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Subscription name." },
            topic: { type: "string", description: "Topic to subscribe to." },
            ackDeadlineSeconds: {
              type: "number",
              description: "Ack deadline in seconds. Defaults to 10.",
            },
            pushEndpoint: {
              type: "string",
              description:
                "Push endpoint URL. If omitted, creates a pull subscription.",
            },
            messageRetentionDuration: {
              type: "string",
              description: "Message retention (e.g., '604800s' for 7 days).",
            },
          },
          required: ["name", "topic"],
        },
        handler: async (params) => {
          const topic = clients.pubsub.topic(params.topic as string);
          const options: Record<string, unknown> = {};
          if (params.ackDeadlineSeconds) options.ackDeadlineSeconds = params.ackDeadlineSeconds;
          if (params.pushEndpoint) {
            options.pushConfig = { pushEndpoint: params.pushEndpoint };
          }
          if (params.messageRetentionDuration) {
            options.messageRetentionDuration = {
              seconds: parseInt(params.messageRetentionDuration as string, 10),
            };
          }
          const [subscription] = await topic.createSubscription(
            params.name as string,
            options,
          );
          return { name: subscription.name };
        },
      },
      {
        name: "gcp_pubsub_subscription_delete",
        description: "Delete a Pub/Sub subscription.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Subscription name." },
          },
          required: ["name"],
        },
        handler: async (params) => {
          const subscription = clients.pubsub.subscription(params.name as string);
          await subscription.delete();
          return { deleted: params.name };
        },
      },
    ];
  },
};
