import type { Resource, Tool } from "@terror/core";
import type { GcpClients } from "../client.js";
import type { GcpConfig } from "../provider.js";

export interface IamResourceDefinition {
  type: string;
  list(clients: GcpClients, config: GcpConfig): Promise<Resource[]>;
  getTools(clients: GcpClients, config: GcpConfig): Tool[];
  getConsolidatedTool(clients: GcpClients, config: GcpConfig): Tool;
}

export const iamResource: IamResourceDefinition = {
  type: "iam-service-account",

  async list(clients, config): Promise<Resource[]> {
    const response = await clients.iam.projects.serviceAccounts.list({
      name: `projects/${config.projectId}`,
    });

    return (response.data.accounts ?? []).map((account) => ({
      id: account.uniqueId ?? "",
      type: "iam-service-account",
      provider: "gcp",
      name: account.email ?? "",
      status: account.disabled ? "error" : "active",
      properties: {
        displayName: account.displayName,
        description: account.description,
        email: account.email,
        disabled: account.disabled,
        oauth2ClientId: account.oauth2ClientId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  },

  getTools(clients, config): Tool[] {
    return [
      {
        name: "gcp_iam_service_account_list",
        description: "List all IAM service accounts in the project.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          const response = await clients.iam.projects.serviceAccounts.list({
            name: `projects/${config.projectId}`,
          });
          return (response.data.accounts ?? []).map((a) => ({
            email: a.email,
            displayName: a.displayName,
            disabled: a.disabled,
          }));
        },
      },
      {
        name: "gcp_iam_service_account_get",
        description: "Get details for a specific IAM service account.",
        inputSchema: {
          type: "object",
          properties: {
            email: {
              type: "string",
              description: "Service account email (e.g., 'my-sa@my-project.iam.gserviceaccount.com').",
            },
          },
          required: ["email"],
        },
        handler: async (params) => {
          const response = await clients.iam.projects.serviceAccounts.get({
            name: `projects/${config.projectId}/serviceAccounts/${params.email as string}`,
          });
          return response.data;
        },
      },
      {
        name: "gcp_iam_service_account_create",
        description: "Create a new IAM service account.",
        inputSchema: {
          type: "object",
          properties: {
            accountId: {
              type: "string",
              description: "Account ID (used in the email: <accountId>@<project>.iam.gserviceaccount.com).",
            },
            displayName: {
              type: "string",
              description: "Human-readable display name.",
            },
            description: {
              type: "string",
              description: "Description of the service account's purpose.",
            },
          },
          required: ["accountId"],
        },
        handler: async (params) => {
          const response = await clients.iam.projects.serviceAccounts.create({
            name: `projects/${config.projectId}`,
            requestBody: {
              accountId: params.accountId as string,
              serviceAccount: {
                displayName: params.displayName as string | undefined,
                description: params.description as string | undefined,
              },
            },
          });
          return response.data;
        },
      },
      {
        name: "gcp_iam_service_account_update",
        description: "Update an IAM service account's display name or description.",
        inputSchema: {
          type: "object",
          properties: {
            email: { type: "string", description: "Service account email." },
            displayName: { type: "string", description: "New display name." },
            description: { type: "string", description: "New description." },
          },
          required: ["email"],
        },
        handler: async (params) => {
          const name = `projects/${config.projectId}/serviceAccounts/${params.email as string}`;
          const response = await clients.iam.projects.serviceAccounts.patch({
            name,
            requestBody: {
              serviceAccount: {
                displayName: params.displayName as string | undefined,
                description: params.description as string | undefined,
              },
              updateMask: "displayName,description",
            },
          });
          return response.data;
        },
      },
      {
        name: "gcp_iam_service_account_delete",
        description: "Delete an IAM service account. Keys and bindings are also removed.",
        inputSchema: {
          type: "object",
          properties: {
            email: { type: "string", description: "Service account email." },
          },
          required: ["email"],
        },
        handler: async (params) => {
          await clients.iam.projects.serviceAccounts.delete({
            name: `projects/${config.projectId}/serviceAccounts/${params.email as string}`,
          });
          return { deleted: params.email, rollback: { action: "create", email: params.email } };
        },
      },
      {
        name: "gcp_iam_policy_get",
        description: "Get the IAM policy for the project (all role bindings).",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          // TODO: Use the Resource Manager API to get project IAM policy
          // The googleapis iam client doesn't directly expose project-level policies;
          // use google.cloudresourcemanager('v3').projects.getIamPolicy()
          throw new Error("Not yet implemented: use Cloud Resource Manager API");
        },
      },
      {
        name: "gcp_iam_policy_binding_add",
        description:
          "Add an IAM policy binding. Grants a role to a member on the project.",
        inputSchema: {
          type: "object",
          properties: {
            member: {
              type: "string",
              description:
                "Member identity (e.g., 'user:email@example.com', 'serviceAccount:sa@project.iam.gserviceaccount.com').",
            },
            role: {
              type: "string",
              description: "IAM role to grant (e.g., 'roles/viewer', 'roles/storage.admin').",
            },
          },
          required: ["member", "role"],
        },
        handler: async (params) => {
          // TODO: Implement read-modify-write on project IAM policy
          // 1. Get current policy via cloudresourcemanager
          // 2. Add binding { role, members: [member] }
          // 3. Set updated policy
          throw new Error(
            `Not yet implemented: add binding ${params.role} -> ${params.member}`,
          );
        },
      },
      {
        name: "gcp_iam_policy_binding_remove",
        description: "Remove an IAM policy binding from the project.",
        inputSchema: {
          type: "object",
          properties: {
            member: {
              type: "string",
              description: "Member identity to remove.",
            },
            role: {
              type: "string",
              description: "Role to remove the member from.",
            },
          },
          required: ["member", "role"],
        },
        handler: async (params) => {
          // TODO: Implement read-modify-write on project IAM policy
          throw new Error(
            `Not yet implemented: remove binding ${params.role} -> ${params.member}`,
          );
        },
      },
    ];
  },

  getConsolidatedTool(clients, config): Tool {
    const individualTools = iamResource.getTools(clients, config);
    const toolMap = new Map(individualTools.map((t) => [t.name, t]));

    return {
      name: "gcp_iam",
      description:
        "Manage GCP IAM service accounts and policy bindings.\n\n" +
        "Actions:\n" +
        "- list_service_accounts: List all service accounts.\n" +
        "- get_service_account: Get service account details. Params: email (string)\n" +
        "- create_service_account: Create a service account. Params: accountId (string), displayName? (string), description? (string)\n" +
        "- update_service_account: Update a service account. Params: email (string), displayName? (string), description? (string)\n" +
        "- delete_service_account: Delete a service account. Params: email (string)\n" +
        "- get_policy: Get project IAM policy.\n" +
        "- add_binding: Add an IAM binding. Params: member (string), role (string)\n" +
        "- remove_binding: Remove an IAM binding. Params: member (string), role (string)",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list_service_accounts", "get_service_account", "create_service_account", "update_service_account", "delete_service_account", "get_policy", "add_binding", "remove_binding"],
            description: "The action to perform.",
          },
          email: { type: "string", description: "Service account email." },
          accountId: { type: "string", description: "Account ID for new service account." },
          displayName: { type: "string", description: "Display name." },
          description: { type: "string", description: "Description." },
          member: { type: "string", description: "Member identity (e.g., 'user:email@example.com')." },
          role: { type: "string", description: "IAM role (e.g., 'roles/viewer')." },
        },
        required: ["action"],
      },
      handler: async (params) => {
        const action = params.action as string;
        const actionToTool: Record<string, string> = {
          list_service_accounts: "gcp_iam_service_account_list",
          get_service_account: "gcp_iam_service_account_get",
          create_service_account: "gcp_iam_service_account_create",
          update_service_account: "gcp_iam_service_account_update",
          delete_service_account: "gcp_iam_service_account_delete",
          get_policy: "gcp_iam_policy_get",
          add_binding: "gcp_iam_policy_binding_add",
          remove_binding: "gcp_iam_policy_binding_remove",
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
