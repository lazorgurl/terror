import type { Provider, Resource, Tool, OAuthTokens } from "@terror/core";
import { createGcpClients, type GcpClients } from "./client.js";
import { computeResource } from "./resources/compute.js";
import { storageResource } from "./resources/storage.js";
import { cloudRunResource } from "./resources/cloud-run.js";
import { cloudFunctionsResource } from "./resources/cloud-functions.js";
import { cloudSqlResource } from "./resources/cloud-sql.js";
import { pubsubResource } from "./resources/pubsub.js";
import { iamResource } from "./resources/iam.js";
import { networkResource } from "./resources/network.js";
import { deployStaticSite, deployCloudRunService, createApiBackend } from "./composite.js";

export interface GcpConfig {
  projectId: string;
  region: string;
  credentials?: OAuthTokens;
}

const ALL_RESOURCES = [
  computeResource,
  storageResource,
  cloudRunResource,
  cloudFunctionsResource,
  cloudSqlResource,
  pubsubResource,
  iamResource,
  networkResource,
] as const;

export class GcpProvider implements Provider {
  readonly name = "gcp";

  private config: GcpConfig;
  private clients: GcpClients | null = null;

  constructor(config: GcpConfig) {
    this.config = config;
    if (config.credentials) {
      this.clients = createGcpClients(config.projectId, config.credentials);
    }
  }

  async authenticate(): Promise<void> {
    // TODO: Trigger OAuth flow via @terror/core's OAuthBroker
    throw new Error(
      "OAuth flow not yet implemented. Provide credentials in GcpConfig or implement OAuthBroker.",
    );
  }

  async listResources(type?: string): Promise<Resource[]> {
    const clients = this.getClients();

    const resources: Resource[] = [];
    const targetResources = type
      ? ALL_RESOURCES.filter((r) => r.type === type)
      : [...ALL_RESOURCES];

    for (const resource of targetResources) {
      const items = await resource.list(clients, this.config);
      resources.push(...items);
    }

    return resources;
  }

  getTools(): Tool[] {
    const tools: Tool[] = [];
    for (const resource of ALL_RESOURCES) {
      // Pass a lazy client getter — tools are registered at startup but
      // clients may not be initialized until the tool is actually called
      tools.push(...resource.getTools(this.lazyClients(), this.config));
    }
    return tools;
  }

  getCompositeTools(): Tool[] {
    const clients = this.lazyClients();
    return [
      deployStaticSite(clients, this.config),
      deployCloudRunService(clients, this.config),
      createApiBackend(clients, this.config),
    ];
  }

  private getClients(): GcpClients {
    if (!this.clients) {
      throw new Error(
        "GCP clients not initialized. Call authenticate() or provide credentials in GcpConfig.",
      );
    }
    return this.clients;
  }

  // Returns a proxy that defers client access until a property is actually used.
  // This lets tools be registered at startup without requiring auth upfront.
  private lazyClients(): GcpClients {
    const provider = this;
    return new Proxy({} as GcpClients, {
      get(_target, prop) {
        const clients = provider.getClients();
        return (clients as any)[prop];
      },
    });
  }
}
