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

  describe("getTools (consolidated)", () => {
    it("returns one consolidated tool per resource type", () => {
      const tools = provider.getTools();
      expect(tools).toHaveLength(8);
    });

    it("returns tools with unique names", () => {
      const tools = provider.getTools();
      const names = tools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it("includes expected consolidated tool names", () => {
      const tools = provider.getTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("gcp_compute");
      expect(names).toContain("gcp_storage");
      expect(names).toContain("gcp_cloud_run");
      expect(names).toContain("gcp_cloud_functions");
      expect(names).toContain("gcp_cloud_sql");
      expect(names).toContain("gcp_pubsub");
      expect(names).toContain("gcp_iam");
      expect(names).toContain("gcp_network");
    });

    it("all tools have an action enum in their input schema", () => {
      const tools = provider.getTools();
      for (const tool of tools) {
        expect(tool.inputSchema).toHaveProperty("type", "object");
        const props = tool.inputSchema.properties as Record<string, any>;
        expect(props.action).toBeDefined();
        expect(props.action.enum).toBeDefined();
        expect(props.action.enum.length).toBeGreaterThan(0);
      }
    });

    it("all tools require only 'action'", () => {
      const tools = provider.getTools();
      for (const tool of tools) {
        expect(tool.inputSchema.required).toEqual(["action"]);
      }
    });
  });

  describe("consolidated tool dispatch", () => {
    it("gcp_compute dispatches list action", async () => {
      const tools = provider.getTools();
      const compute = tools.find((t) => t.name === "gcp_compute")!;
      await compute.handler({ action: "list" });
      expect(mockClients.computeInstances.aggregatedListAsync).toHaveBeenCalled();
    });

    it("gcp_compute dispatches get action", async () => {
      const tools = provider.getTools();
      const compute = tools.find((t) => t.name === "gcp_compute")!;
      await compute.handler({ action: "get", name: "my-instance", zone: "us-central1-a" });
      expect(mockClients.computeInstances.get).toHaveBeenCalledWith({
        project: "test-project",
        instance: "my-instance",
        zone: "us-central1-a",
      });
    });

    it("gcp_compute rejects unknown actions", async () => {
      const tools = provider.getTools();
      const compute = tools.find((t) => t.name === "gcp_compute")!;
      await expect(compute.handler({ action: "invalid" })).rejects.toThrow("Unknown action");
    });

    it("gcp_storage dispatches list_buckets action", async () => {
      const tools = provider.getTools();
      const storage = tools.find((t) => t.name === "gcp_storage")!;
      await storage.handler({ action: "list_buckets" });
      expect(mockClients.storage.getBuckets).toHaveBeenCalled();
    });

    it("gcp_storage dispatches get_bucket action", async () => {
      const tools = provider.getTools();
      const storage = tools.find((t) => t.name === "gcp_storage")!;
      await storage.handler({ action: "get_bucket", name: "my-bucket" });
      expect(mockClients.storage.bucket).toHaveBeenCalledWith("my-bucket");
    });

    it("gcp_cloud_sql dispatches list action", async () => {
      const tools = provider.getTools();
      const sql = tools.find((t) => t.name === "gcp_cloud_sql")!;
      await sql.handler({ action: "list" });
      expect(mockClients.sqladmin.instances.list).toHaveBeenCalled();
    });

    it("gcp_pubsub dispatches create_topic action", async () => {
      const tools = provider.getTools();
      const pubsub = tools.find((t) => t.name === "gcp_pubsub")!;
      await pubsub.handler({ action: "create_topic", name: "my-topic" });
      expect(mockClients.pubsub.createTopic).toHaveBeenCalled();
    });

    it("gcp_network dispatches list_firewalls action", async () => {
      const tools = provider.getTools();
      const network = tools.find((t) => t.name === "gcp_network")!;
      await network.handler({ action: "list_firewalls" });
      expect(mockClients.firewalls.list).toHaveBeenCalled();
    });
  });

  describe("getCompositeTools (consolidated)", () => {
    it("returns one consolidated deploy tool", () => {
      const tools = provider.getCompositeTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("gcp_deploy");
    });

    it("gcp_deploy has action enum with three deploy types", () => {
      const tools = provider.getCompositeTools();
      const deploy = tools[0];
      const props = deploy.inputSchema.properties as Record<string, any>;
      expect(props.action.enum).toEqual(["static_site", "cloud_run_service", "api_backend"]);
    });
  });

  describe("getIndividualTools (backwards compat)", () => {
    it("returns all individual tools", () => {
      const tools = provider.getIndividualTools();
      expect(tools.length).toBeGreaterThan(40);
    });

    it("includes compute tools", () => {
      const tools = provider.getIndividualTools();
      const computeTools = tools.filter((t) => t.name.startsWith("gcp_compute_"));
      expect(computeTools.length).toBe(6);
    });

    it("includes storage tools", () => {
      const tools = provider.getIndividualTools();
      const storageTools = tools.filter((t) => t.name.startsWith("gcp_storage_"));
      expect(storageTools.length).toBe(9);
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

  describe("without explicit credentials", () => {
    it("still creates clients using ADC and returns tools", () => {
      const adcProvider = new GcpProvider({
        projectId: "test",
        region: "us-central1",
      });
      const tools = adcProvider.getTools();
      expect(tools.length).toBe(8);
    });

    it("authenticate is a no-op when clients already exist", async () => {
      const adcProvider = new GcpProvider({
        projectId: "test",
        region: "us-central1",
      });
      await expect(adcProvider.authenticate()).resolves.toBeUndefined();
    });
  });
});
