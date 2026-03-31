import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ResponseOptimizer } from "../response-optimizer.js";
import type { Resource } from "../types.js";

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "inst-1",
    type: "compute-instance",
    provider: "gcp",
    name: "web-server-1",
    status: "active",
    properties: {
      machineType: "zones/us-central1-a/machineTypes/e2-medium",
      zone: "zones/us-central1-a",
    },
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-06-01T00:00:00Z"),
    ...overrides,
  };
}

function makeBucketResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "bucket-1",
    type: "storage-bucket",
    provider: "gcp",
    name: "my-data-bucket",
    status: "active",
    properties: {
      location: "US",
      storageClass: "STANDARD",
    },
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-06-01T00:00:00Z"),
    ...overrides,
  };
}

describe("ResponseOptimizer", () => {
  let optimizer: ResponseOptimizer;

  beforeEach(() => {
    optimizer = new ResponseOptimizer();
  });

  afterEach(() => {
    optimizer.clearCache();
    vi.restoreAllMocks();
  });

  describe("summarizeList", () => {
    it("strips resources down to summary fields", () => {
      const resources = [makeResource(), makeBucketResource()];
      const summaries = optimizer.summarizeList(resources);

      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toEqual({
        id: "inst-1",
        name: "web-server-1",
        type: "compute-instance",
        status: "active",
        summary: "e2-medium, us-central1-a, ACTIVE",
      });
      expect(summaries[1]).toEqual({
        id: "bucket-1",
        name: "my-data-bucket",
        type: "storage-bucket",
        status: "active",
        summary: "US, STANDARD, ACTIVE",
      });
    });

    it("returns empty array for empty input", () => {
      expect(optimizer.summarizeList([])).toEqual([]);
    });

    it("handles resources with no properties gracefully", () => {
      const resource = makeResource({ properties: {} });
      const [summary] = optimizer.summarizeList([resource]);
      expect(summary.summary).toBe("ACTIVE");
    });
  });

  describe("filterFields", () => {
    it("returns only requested fields", () => {
      const resource = makeResource();
      const filtered = optimizer.filterFields(resource, ["id", "name", "status"]);

      expect(filtered).toEqual({
        id: "inst-1",
        name: "web-server-1",
        status: "active",
      });
      expect(filtered).not.toHaveProperty("properties");
      expect(filtered).not.toHaveProperty("createdAt");
    });

    it("returns summary view when no fields specified", () => {
      const resource = makeResource();
      const filtered = optimizer.filterFields(resource);

      expect(filtered).toEqual({
        id: "inst-1",
        name: "web-server-1",
        type: "compute-instance",
        status: "active",
      });
    });

    it("returns summary view for empty fields array", () => {
      const resource = makeResource();
      const filtered = optimizer.filterFields(resource, []);

      expect(filtered).toEqual({
        id: "inst-1",
        name: "web-server-1",
        type: "compute-instance",
        status: "active",
      });
    });

    it("ignores fields that do not exist on the resource", () => {
      const resource = makeResource();
      const filtered = optimizer.filterFields(resource, ["id", "nonexistent"]);

      expect(filtered).toEqual({ id: "inst-1" });
    });
  });

  describe("computeDelta", () => {
    it("detects added resources", () => {
      const previous = [makeResource({ id: "a" })];
      const current = [makeResource({ id: "a" }), makeResource({ id: "b", name: "new-server" })];

      const delta = optimizer.computeDelta(previous, current);

      expect(delta.added).toHaveLength(1);
      expect(delta.added[0].id).toBe("b");
      expect(delta.removed).toHaveLength(0);
      expect(delta.modified).toHaveLength(0);
      expect(delta.unchanged).toBe(1);
    });

    it("detects removed resources", () => {
      const previous = [
        makeResource({ id: "a" }),
        makeResource({ id: "b", name: "old-server" }),
      ];
      const current = [makeResource({ id: "a" })];

      const delta = optimizer.computeDelta(previous, current);

      expect(delta.removed).toHaveLength(1);
      expect(delta.removed[0].id).toBe("b");
      expect(delta.added).toHaveLength(0);
      expect(delta.unchanged).toBe(1);
    });

    it("detects modified resources", () => {
      const previous = [makeResource({ id: "a", status: "active" })];
      const current = [makeResource({ id: "a", status: "pending" })];

      const delta = optimizer.computeDelta(previous, current);

      expect(delta.modified).toHaveLength(1);
      expect(delta.modified[0].id).toBe("a");
      expect(delta.modified[0].changedFields).toHaveProperty("status");
      expect(delta.modified[0].changedFields.status).toEqual({
        from: "active",
        to: "pending",
      });
      expect(delta.unchanged).toBe(0);
    });

    it("reports unchanged count correctly", () => {
      const resources = [
        makeResource({ id: "a" }),
        makeResource({ id: "b" }),
        makeResource({ id: "c" }),
      ];

      const delta = optimizer.computeDelta(resources, resources);
      expect(delta.unchanged).toBe(3);
      expect(delta.added).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.modified).toHaveLength(0);
    });

    it("detects property changes", () => {
      const previous = [
        makeResource({
          id: "a",
          properties: { machineType: "e2-micro", zone: "us-central1-a" },
        }),
      ];
      const current = [
        makeResource({
          id: "a",
          properties: { machineType: "e2-medium", zone: "us-central1-a" },
        }),
      ];

      const delta = optimizer.computeDelta(previous, current);
      expect(delta.modified).toHaveLength(1);
      expect(delta.modified[0].changedFields["properties.machineType"]).toEqual({
        from: "e2-micro",
        to: "e2-medium",
      });
    });
  });

  describe("getDeltaFromCache", () => {
    it("returns null on first call (cache miss)", () => {
      const resources = [makeResource()];
      const result = optimizer.getDeltaFromCache("gcp", "compute", resources);
      expect(result).toBeNull();
    });

    it("returns delta on second call", () => {
      const first = [makeResource({ id: "a" })];
      optimizer.getDeltaFromCache("gcp", "compute", first);

      const second = [
        makeResource({ id: "a" }),
        makeResource({ id: "b", name: "new-one" }),
      ];
      const delta = optimizer.getDeltaFromCache("gcp", "compute", second);

      expect(delta).not.toBeNull();
      expect(delta!.added).toHaveLength(1);
      expect(delta!.added[0].id).toBe("b");
      expect(delta!.unchanged).toBe(1);
    });

    it("returns null after TTL expires", () => {
      const shortTtl = new ResponseOptimizer(100);

      const first = [makeResource({ id: "a" })];
      shortTtl.getDeltaFromCache("gcp", "compute", first);

      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 200);

      const second = [makeResource({ id: "a" }), makeResource({ id: "b" })];
      const delta = shortTtl.getDeltaFromCache("gcp", "compute", second);

      expect(delta).toBeNull();
    });

    it("separates cache by provider and resource type", () => {
      optimizer.getDeltaFromCache("gcp", "compute", [makeResource({ id: "a" })]);
      optimizer.getDeltaFromCache("gcp", "storage", [makeBucketResource({ id: "x" })]);

      const computeDelta = optimizer.getDeltaFromCache("gcp", "compute", [
        makeResource({ id: "a" }),
        makeResource({ id: "b" }),
      ]);
      expect(computeDelta).not.toBeNull();
      expect(computeDelta!.added).toHaveLength(1);
      expect(computeDelta!.added[0].id).toBe("b");

      const storageDelta = optimizer.getDeltaFromCache("gcp", "storage", [
        makeBucketResource({ id: "x" }),
      ]);
      expect(storageDelta).not.toBeNull();
      expect(storageDelta!.unchanged).toBe(1);
      expect(storageDelta!.added).toHaveLength(0);
    });
  });

  describe("paginate", () => {
    it("returns the first page with cursor", () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const page = optimizer.paginate(items, 3);

      expect(page.items).toHaveLength(3);
      expect(page.items[0]).toEqual({ id: 0 });
      expect(page.totalCount).toBe(10);
      expect(page.pageSize).toBe(3);
      expect(page.nextCursor).toBeDefined();
    });

    it("returns subsequent pages using cursor", () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const page1 = optimizer.paginate(items, 3);
      const page2 = optimizer.paginate(items, 3, page1.nextCursor);

      expect(page2.items).toHaveLength(3);
      expect(page2.items[0]).toEqual({ id: 3 });
      expect(page2.nextCursor).toBeDefined();
    });

    it("returns the last page without cursor", () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: i }));
      const page1 = optimizer.paginate(items, 3);
      const page2 = optimizer.paginate(items, 3, page1.nextCursor);

      expect(page2.items).toHaveLength(2);
      expect(page2.nextCursor).toBeUndefined();
    });

    it("handles empty list", () => {
      const page = optimizer.paginate([], 10);

      expect(page.items).toHaveLength(0);
      expect(page.totalCount).toBe(0);
      expect(page.nextCursor).toBeUndefined();
    });

    it("handles page size larger than items", () => {
      const items = [{ id: 1 }, { id: 2 }];
      const page = optimizer.paginate(items, 50);

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeUndefined();
      expect(page.totalCount).toBe(2);
    });

    it("handles exact page boundary", () => {
      const items = Array.from({ length: 6 }, (_, i) => ({ id: i }));
      const page1 = optimizer.paginate(items, 3);
      const page2 = optimizer.paginate(items, 3, page1.nextCursor);

      expect(page2.items).toHaveLength(3);
      expect(page2.nextCursor).toBeUndefined();
    });
  });

  describe("formatResponse", () => {
    it("produces a complete ToolResponse envelope", () => {
      const data = [{ id: "a" }];
      const response = optimizer.formatResponse(data, {
        resourceCount: 1,
        totalCount: 100,
      });

      expect(response.data).toEqual(data);
      expect(response.metadata.resourceCount).toBe(1);
      expect(response.metadata.totalCount).toBe(100);
      expect(typeof response.tokenHint).toBe("string");
    });

    it("generates hint for partial results", () => {
      const response = optimizer.formatResponse([], {
        resourceCount: 10,
        totalCount: 234,
        nextCursor: "abc",
      });

      expect(response.tokenHint).toContain("10 of 234");
      expect(response.tokenHint).toContain("cursor");
    });

    it("generates hint for delta responses", () => {
      const response = optimizer.formatResponse([], {
        cached: true,
        resourceCount: 3,
      });

      expect(response.tokenHint).toContain("Delta");
    });

    it("generates hint for summary data with get tool reference", () => {
      const summaryData = [{ id: "a", name: "test", summary: "e2-medium" }];
      const response = optimizer.formatResponse(summaryData, {
        resourceCount: 1,
      });

      expect(response.tokenHint).toContain("get tool");
    });

    it("generates default hint when no metadata provided", () => {
      const response = optimizer.formatResponse({ some: "data" });

      expect(response.tokenHint).toBe("Complete response.");
      expect(response.metadata).toEqual({});
    });

    it("includes truncated hint", () => {
      const response = optimizer.formatResponse([], {
        resourceCount: 50,
        totalCount: 50,
        truncated: true,
      });

      expect(response.tokenHint).toContain("truncated");
    });
  });
});
