import type { Resource, Tool } from "@terror/core";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface PubsubResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
  getConsolidatedTool(clients: GcpClients, config: GcpConfig): Tool;
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

  getConsolidatedTool(clients, config): Tool {
    const individualTools = pubsubResource.getTools(clients, config);
    const toolMap = new Map(individualTools.map((t) => [t.name, t]));

    return {
      name: "gcp_pubsub",
      description:
        "Manage GCP Pub/Sub topics and subscriptions.\n\n" +
        "Actions:\n" +
        "- list_topics: List all topics.\n" +
        "- get_topic: Get topic metadata. Params: name (string)\n" +
        "- create_topic: Create a topic. Params: name (string), labels? (object), messageRetentionDuration? (string)\n" +
        "- delete_topic: Delete a topic. Params: name (string)\n" +
        "- list_subscriptions: List subscriptions. Params: topic? (string)\n" +
        "- get_subscription: Get subscription metadata. Params: name (string)\n" +
        "- create_subscription: Create a subscription. Params: name (string), topic (string), ackDeadlineSeconds? (number), pushEndpoint? (string), messageRetentionDuration? (string)\n" +
        "- delete_subscription: Delete a subscription. Params: name (string)",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list_topics", "get_topic", "create_topic", "delete_topic", "list_subscriptions", "get_subscription", "create_subscription", "delete_subscription"],
            description: "The action to perform.",
          },
          name: { type: "string", description: "Topic or subscription name." },
          topic: { type: "string", description: "Topic name (for subscription actions)." },
          labels: { type: "object", additionalProperties: { type: "string" }, description: "Labels (create_topic)." },
          messageRetentionDuration: { type: "string", description: "Retention duration in seconds (e.g., '86400s')." },
          ackDeadlineSeconds: { type: "number", description: "Ack deadline in seconds (create_subscription)." },
          pushEndpoint: { type: "string", description: "Push endpoint URL (create_subscription)." },
        },
        required: ["action"],
      },
      handler: async (params) => {
        const action = params.action as string;
        const actionToTool: Record<string, string> = {
          list_topics: "gcp_pubsub_topic_list",
          get_topic: "gcp_pubsub_topic_get",
          create_topic: "gcp_pubsub_topic_create",
          delete_topic: "gcp_pubsub_topic_delete",
          list_subscriptions: "gcp_pubsub_subscription_list",
          get_subscription: "gcp_pubsub_subscription_get",
          create_subscription: "gcp_pubsub_subscription_create",
          delete_subscription: "gcp_pubsub_subscription_delete",
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
