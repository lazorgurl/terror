import { describe, it, expect, vi, beforeEach } from "vitest";
import { GcpProvider, type GcpConfig } from "../provider.js";
import type { Provider, Resource, Tool, OAuthTokens } from "@terror/core";

vi.mock("../client.js", () => ({
  createGcpClients: vi.fn(() => mockClients),
}));

const mockClients = {
  computeInstances: {
    aggregatedListAsync: vi.fn().mockReturnValue((async function* () {})()),
    list: vi.fn().mockResolvedValue([[]]),
    get: vi.fn().mockResolvedValue([{}]),
    insert: vi.fn().mockResolvedValue([{}]),
    start: vi.fn().mockResolvedValue([{}]),
    stop: vi.fn().mockResolvedValue([{}]),
    delete: vi.fn().mockResolvedValue([{}]),
  },
  firewalls: {
    list: vi.fn().mockResolvedValue([[]]),
    get: vi.fn().mockResolvedValue([{}]),
    insert: vi.fn().mockResolvedValue([{}]),
    patch: vi.fn().mockResolvedValue([{}]),
    delete: vi.fn().mockResolvedValue([{}]),
  },
  networks: {
    list: vi.fn().mockResolvedValue([[]]),
    get: vi.fn().mockResolvedValue([{}]),
    insert: vi.fn().mockResolvedValue([{}]),
    patch: vi.fn().mockResolvedValue([{}]),
    delete: vi.fn().mockResolvedValue([{}]),
  },
  subnetworks: {
    list: vi.fn().mockResolvedValue([[]]),
    aggregatedListAsync: vi.fn().mockReturnValue((async function* () {})()),
    get: vi.fn().mockResolvedValue([{}]),
    insert: vi.fn().mockResolvedValue([{}]),
    setPrivateIpGoogleAccess: vi.fn().mockResolvedValue([{}]),
    delete: vi.fn().mockResolvedValue([{}]),
  },
  storage: {
    getBuckets: vi.fn().mockResolvedValue([[]]),
    bucket: vi.fn().mockReturnValue({
      getMetadata: vi.fn().mockResolvedValue([{}]),
      setMetadata: vi.fn().mockResolvedValue([{}]),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteFiles: vi.fn().mockResolvedValue(undefined),
      makePublic: vi.fn().mockResolvedValue(undefined),
      file: vi.fn().mockReturnValue({
        getMetadata: vi.fn().mockResolvedValue([{}]),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      getFiles: vi.fn().mockResolvedValue([[]]),
    }),
    createBucket: vi.fn().mockResolvedValue([
      {
        name: "test-bucket",
        metadata: {},
        makePublic: vi.fn().mockResolvedValue(undefined),
        file: vi.fn().mockReturnValue({
          save: vi.fn().mockResolvedValue(undefined),
        }),
      },
    ]),
  },
  cloudRun: {
    listServices: vi.fn().mockResolvedValue([[]]),
    getService: vi.fn().mockResolvedValue([{ uri: "https://test.run.app" }]),
    createService: vi.fn().mockResolvedValue([{}]),
    updateService: vi.fn().mockResolvedValue([{}]),
    deleteService: vi.fn().mockResolvedValue([{}]),
  },
  cloudFunctions: {
    listFunctions: vi.fn().mockResolvedValue([[]]),
    getFunction: vi.fn().mockResolvedValue([{}]),
    createFunction: vi.fn().mockResolvedValue([{}]),
    updateFunction: vi.fn().mockResolvedValue([{}]),
    deleteFunction: vi.fn().mockResolvedValue([{}]),
  },
  pubsub: {
    getTopics: vi.fn().mockResolvedValue([[]]),
    getSubscriptions: vi.fn().mockResolvedValue([[]]),
    topic: vi.fn().mockReturnValue({
      getMetadata: vi.fn().mockResolvedValue([{}]),
      delete: vi.fn().mockResolvedValue(undefined),
      getSubscriptions: vi.fn().mockResolvedValue([[]]),
      createSubscription: vi.fn().mockResolvedValue([{ name: "test-sub" }]),
    }),
    subscription: vi.fn().mockReturnValue({
      getMetadata: vi.fn().mockResolvedValue([{}]),
      delete: vi.fn().mockResolvedValue(undefined),
    }),
    createTopic: vi.fn().mockResolvedValue([{ name: "test-topic" }]),
  },
  sqladmin: {
    instances: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
      get: vi.fn().mockResolvedValue({ data: {} }),
      insert: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
  },
  iam: {
    projects: {
      serviceAccounts: {
        list: vi.fn().mockResolvedValue({ data: { accounts: [] } }),
        get: vi.fn().mockResolvedValue({ data: {} }),
        create: vi.fn().mockResolvedValue({ data: {} }),
        patch: vi.fn().mockResolvedValue({ data: {} }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
};

const testCredentials: OAuthTokens = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  expiresAt: new Date(Date.now() + 3600000),
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
};

const testConfig: GcpConfig = {
  projectId: "test-project",
  region: "us-central1",
  credentials: testCredentials,
};

describe("GcpProvider", () => {
  let provider: GcpProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GcpProvider(testConfig);
  });

  it("implements the Provider interface", () => {
    const p: Provider = provider;
    expect(p.name).toBe("gcp");
    expect(typeof p.authenticate).toBe("function");
    expect(typeof p.listResources).toBe("function");
    expect(typeof p.getTools).toBe("function");
    expect(typeof p.getCompositeTools).toBe("function");
  });

  it("has name 'gcp'", () => {
    expect(provider.name).toBe("gcp");
  });

  describe("getTools", () => {
    it("returns tools for all resource types", () => {
      const tools = provider.getTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((t): t is Tool => typeof t.name === "string")).toBe(true);
      expect(tools.every((t) => typeof t.description === "string")).toBe(true);
      expect(tools.every((t) => typeof t.inputSchema === "object")).toBe(true);
      expect(tools.every((t) => typeof t.handler === "function")).toBe(true);
    });

    it("returns tools with unique names", () => {
      const tools = provider.getTools();
      const names = tools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it("includes compute tools", () => {
      const tools = provider.getTools();
      const computeTools = tools.filter((t) => t.name.startsWith("gcp_compute_"));
      expect(computeTools.length).toBe(6);
    });

    it("includes storage tools", () => {
      const tools = provider.getTools();
      const storageTools = tools.filter((t) => t.name.startsWith("gcp_storage_"));
      expect(storageTools.length).toBe(9);
    });

    it("includes cloud run tools", () => {
      const tools = provider.getTools();
      const runTools = tools.filter((t) => t.name.startsWith("gcp_cloud_run_"));
      expect(runTools.length).toBe(5);
    });

    it("includes cloud functions tools", () => {
      const tools = provider.getTools();
      const fnTools = tools.filter((t) => t.name.startsWith("gcp_functions_"));
      expect(fnTools.length).toBe(5);
    });

    it("includes cloud sql tools", () => {
      const tools = provider.getTools();
      const sqlTools = tools.filter((t) => t.name.startsWith("gcp_sql_"));
      expect(sqlTools.length).toBe(5);
    });

    it("includes pubsub tools", () => {
      const tools = provider.getTools();
      const pubsubTools = tools.filter((t) => t.name.startsWith("gcp_pubsub_"));
      expect(pubsubTools.length).toBe(8);
    });

    it("includes iam tools", () => {
      const tools = provider.getTools();
      const iamTools = tools.filter((t) => t.name.startsWith("gcp_iam_"));
      expect(iamTools.length).toBe(8);
    });

    it("includes network tools", () => {
      const tools = provider.getTools();
      const networkTools = tools.filter((t) => t.name.startsWith("gcp_network_"));
      expect(networkTools.length).toBeGreaterThanOrEqual(12);
    });

    it("all tools have valid JSON Schema input definitions", () => {
      const tools = provider.getTools();
      for (const tool of tools) {
        expect(tool.inputSchema).toHaveProperty("type", "object");
        expect(tool.inputSchema).toHaveProperty("properties");
      }
    });
  });

  describe("getCompositeTools", () => {
    it("returns three composite tools", () => {
      const tools = provider.getCompositeTools();
      expect(tools).toHaveLength(3);
    });

    it("includes deployStaticSite", () => {
      const tools = provider.getCompositeTools();
      const staticSite = tools.find((t) => t.name === "gcp_deploy_static_site");
      expect(staticSite).toBeDefined();
      expect(staticSite!.inputSchema).toHaveProperty("properties");
      expect(
        (staticSite!.inputSchema as Record<string, Record<string, unknown>>).required,
      ).toContain("bucketName");
    });

    it("includes deployCloudRunService", () => {
      const tools = provider.getCompositeTools();
      const runDeploy = tools.find((t) => t.name === "gcp_deploy_cloud_run_full");
      expect(runDeploy).toBeDefined();
    });

    it("includes createApiBackend", () => {
      const tools = provider.getCompositeTools();
      const api = tools.find((t) => t.name === "gcp_create_api_backend");
      expect(api).toBeDefined();
    });
  });

  describe("listResources", () => {
    it("returns an empty array when no resources exist", async () => {
      const resources = await provider.listResources();
      expect(resources).toEqual([]);
    });

    it("calls all resource list functions", async () => {
      await provider.listResources();
      expect(mockClients.computeInstances.aggregatedListAsync).toHaveBeenCalled();
      expect(mockClients.storage.getBuckets).toHaveBeenCalled();
      expect(mockClients.cloudRun.listServices).toHaveBeenCalled();
      expect(mockClients.cloudFunctions.listFunctions).toHaveBeenCalled();
      expect(mockClients.sqladmin.instances.list).toHaveBeenCalled();
      expect(mockClients.pubsub.getTopics).toHaveBeenCalled();
      expect(mockClients.iam.projects.serviceAccounts.list).toHaveBeenCalled();
      expect(mockClients.networks.list).toHaveBeenCalled();
    });

    it("filters by resource type when specified", async () => {
      await provider.listResources("compute-instance");
      expect(mockClients.computeInstances.aggregatedListAsync).toHaveBeenCalled();
      expect(mockClients.storage.getBuckets).not.toHaveBeenCalled();
    });
  });

  describe("authenticate", () => {
    it("throws when OAuth is not implemented", async () => {
      const unauthProvider = new GcpProvider({
        projectId: "test",
        region: "us-central1",
      });
      await expect(unauthProvider.authenticate()).rejects.toThrow(
        /OAuth flow not yet implemented/,
      );
    });
  });

  describe("without credentials", () => {
    it("returns tools without credentials but throws when a tool handler accesses clients", async () => {
      const unauthProvider = new GcpProvider({
        projectId: "test",
        region: "us-central1",
      });
      const tools = unauthProvider.getTools();
      expect(tools.length).toBeGreaterThan(0);
      // Actually calling a tool should fail because clients aren't initialized
      await expect(tools[0].handler({})).rejects.toThrow(
        /GCP clients not initialized/,
      );
    });

    it("throws when listing resources without credentials", async () => {
      const unauthProvider = new GcpProvider({
        projectId: "test",
        region: "us-central1",
      });
      await expect(unauthProvider.listResources()).rejects.toThrow(
        /GCP clients not initialized/,
      );
    });
  });
});
