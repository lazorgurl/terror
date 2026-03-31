import { describe, it, expect, vi, beforeEach } from "vitest";
import { StatusEmitter } from "../status-emitter.js";
import { PlanEngine } from "../plan-engine.js";
import { DecisionGate } from "../decision-gate.js";
import { Logger } from "../logger.js";
import type {
  Action,
  AuthStatusUpdate,
  CostEstimate,
  GateStatus,
  Plan,
  PlanProgress,
  Provider,
  ProviderHealth,
  ResourceChangeSummary,
  StatusUpdate,
  Tool,
} from "../types.js";

function makeTool(name: string, handler?: Tool["handler"]): Tool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: "object", properties: {} },
    handler: handler ?? vi.fn().mockResolvedValue({ id: "res-1", name: "mock" }),
  };
}

function makeProvider(
  name: string,
  tools: Tool[] = [],
  compositeTools: Tool[] = []
): Provider {
  return {
    name,
    authenticate: vi.fn().mockResolvedValue(undefined),
    listResources: vi.fn().mockResolvedValue([]),
    getTools: () => tools,
    getCompositeTools: () => compositeTools,
  };
}

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: "action-1",
    type: "create",
    resourceType: "instance",
    provider: "test-provider",
    params: { name: "my-instance" },
    description: "Create an instance",
    ...overrides,
  };
}

const silentLogger = new Logger("error");

const permissiveGate = new DecisionGate({
  thresholds: { low: 9999, medium: 99999, high: 999999 },
});

describe("StatusEmitter", () => {
  let emitter: StatusEmitter;

  beforeEach(() => {
    emitter = new StatusEmitter();
  });

  describe("emitStatus", () => {
    it("stores the last status for each type", () => {
      const progress: PlanProgress = {
        type: "plan:progress",
        planId: "p1",
        currentAction: 1,
        totalActions: 3,
        completedActions: 1,
        failedActions: 0,
        rolledBackActions: 0,
        phase: "executing",
      };

      emitter.emitStatus(progress);

      expect(emitter.getLastStatus("plan:progress")).toEqual(progress);
    });

    it("sends notification through MCP server when available", () => {
      const notificationFn = vi.fn().mockResolvedValue(undefined);
      const mockMcpServer = {
        server: { notification: notificationFn },
      } as unknown as Parameters<typeof StatusEmitter["prototype"]["emitStatus"]> extends never[]
        ? never
        : any;

      const emitterWithMcp = new StatusEmitter(mockMcpServer);
      const update: ProviderHealth = {
        type: "health",
        providers: [{ name: "gcp", connected: true, lastChecked: new Date().toISOString() }],
      };

      emitterWithMcp.emitStatus(update);

      expect(notificationFn).toHaveBeenCalledWith({
        method: "terror/status",
        params: update,
      });
    });

    it("stores each status type independently", () => {
      const auth: AuthStatusUpdate = {
        type: "auth:status",
        provider: "gcp",
        authenticated: true,
      };
      const cost: CostEstimate = {
        type: "cost:estimate",
        provider: "gcp",
        estimatedMonthlyCost: "$10.00",
        currency: "USD",
      };

      emitter.emitStatus(auth);
      emitter.emitStatus(cost);

      expect(emitter.getAllStatuses()).toHaveLength(2);
      expect(emitter.getLastStatus("auth:status")).toEqual(auth);
      expect(emitter.getLastStatus("cost:estimate")).toEqual(cost);
    });

    it("overwrites previous status of the same type", () => {
      emitter.emitStatus({
        type: "auth:status",
        provider: "gcp",
        authenticated: false,
      });
      emitter.emitStatus({
        type: "auth:status",
        provider: "gcp",
        authenticated: true,
      });

      const last = emitter.getLastStatus("auth:status") as AuthStatusUpdate;
      expect(last.authenticated).toBe(true);
      expect(emitter.getAllStatuses()).toHaveLength(1);
    });
  });

  describe("emitStatus for each update type", () => {
    it("handles PlanProgress", () => {
      const update: PlanProgress = {
        type: "plan:progress",
        planId: "p1",
        currentAction: 2,
        totalActions: 5,
        completedActions: 2,
        failedActions: 0,
        rolledBackActions: 0,
        phase: "executing",
      };
      emitter.emitStatus(update);
      expect(emitter.getLastStatus("plan:progress")).toEqual(update);
    });

    it("handles AuthStatus", () => {
      const update: AuthStatusUpdate = {
        type: "auth:status",
        provider: "aws",
        authenticated: true,
        expiresAt: "2026-04-01T00:00:00Z",
        scopes: ["read", "write"],
      };
      emitter.emitStatus(update);
      expect(emitter.getLastStatus("auth:status")).toEqual(update);
    });

    it("handles ResourceChangeSummary", () => {
      const update: ResourceChangeSummary = {
        type: "resource:summary",
        provider: "gcp",
        created: 2,
        updated: 1,
        deleted: 0,
        failed: 0,
        resources: [
          { type: "instance", name: "vm-1", action: "create", status: "success" },
          { type: "instance", name: "vm-2", action: "create", status: "success" },
          { type: "bucket", name: "b-1", action: "update", status: "success" },
        ],
      };
      emitter.emitStatus(update);
      expect(emitter.getLastStatus("resource:summary")).toEqual(update);
    });

    it("handles CostEstimate", () => {
      const update: CostEstimate = {
        type: "cost:estimate",
        provider: "aws",
        estimatedMonthlyCost: "$45.00",
        costBreakdown: [{ resource: "aws/instance", monthlyCost: "$25.00" }],
        currency: "USD",
      };
      emitter.emitStatus(update);
      expect(emitter.getLastStatus("cost:estimate")).toEqual(update);
    });

    it("handles GateStatus", () => {
      const update: GateStatus = {
        type: "gate:status",
        planId: "p1",
        riskLevel: "high",
        waitingForReview: true,
      };
      emitter.emitStatus(update);
      expect(emitter.getLastStatus("gate:status")).toEqual(update);
    });

    it("handles ProviderHealth", () => {
      const update: ProviderHealth = {
        type: "health",
        providers: [
          { name: "gcp", connected: true, latencyMs: 42, lastChecked: "2026-03-31T00:00:00Z" },
          { name: "aws", connected: false, lastChecked: "2026-03-31T00:00:00Z" },
        ],
      };
      emitter.emitStatus(update);
      expect(emitter.getLastStatus("health")).toEqual(update);
    });
  });

  describe("startPlanTracking", () => {
    it("auto-emits progress as plan engine events fire", () => {
      const provider = makeProvider("test-provider", [
        makeTool("test-provider:create:instance"),
        makeTool("test-provider:delete:instance"),
      ]);
      const engine = new PlanEngine([provider], silentLogger, { autoApply: true, decisionGate: permissiveGate });
      const plan = engine.createPlan([
        makeAction({ id: "a1" }),
        makeAction({ id: "a2" }),
      ]);

      emitter.startPlanTracking(plan, engine);

      const initialStatus = emitter.getLastStatus("plan:progress") as PlanProgress;
      expect(initialStatus.phase).toBe("validating");
      expect(initialStatus.totalActions).toBe(2);
    });

    it("updates progress on action events", async () => {
      const handler = vi.fn().mockResolvedValue({ id: "res-1" });
      const provider = makeProvider("test-provider", [
        makeTool("test-provider:create:instance", handler),
        makeTool("test-provider:delete:instance"),
      ]);
      const engine = new PlanEngine([provider], silentLogger, { autoApply: true, decisionGate: permissiveGate });
      const plan = engine.createPlan([makeAction({ id: "a1" })]);

      emitter.startPlanTracking(plan, engine);
      await engine.executePlan(plan);

      const finalStatus = emitter.getLastStatus("plan:progress") as PlanProgress;
      expect(finalStatus.phase).toBe("complete");
      expect(finalStatus.completedActions).toBe(1);
    });

    it("tracks failed actions and rollback", async () => {
      const successHandler = vi.fn().mockResolvedValue({ id: "res-1" });
      const failHandler = vi.fn().mockRejectedValue(new Error("Boom"));
      const deleteHandler = vi.fn().mockResolvedValue(undefined);

      const provider = makeProvider("test-provider", [
        makeTool("test-provider:create:instance", successHandler),
        makeTool("test-provider:delete:instance", deleteHandler),
        makeTool("test-provider:update:instance", failHandler),
      ]);
      const engine = new PlanEngine([provider], silentLogger, { autoApply: true, decisionGate: permissiveGate });
      const plan = engine.createPlan([
        makeAction({ id: "a1", type: "create" }),
        makeAction({ id: "a2", type: "update" }),
      ]);

      emitter.startPlanTracking(plan, engine);
      await engine.executePlan(plan);

      const finalStatus = emitter.getLastStatus("plan:progress") as PlanProgress;
      expect(finalStatus.failedActions).toBe(1);
      expect(finalStatus.rolledBackActions).toBeGreaterThanOrEqual(1);
      expect(finalStatus.phase).toBe("rolling-back");
    });
  });

  describe("reportAuth", () => {
    it("emits auth status", () => {
      emitter.reportAuth("gcp", { authenticated: true, expiresAt: "2026-04-01T00:00:00Z" });

      const status = emitter.getLastStatus("auth:status") as AuthStatusUpdate;
      expect(status.provider).toBe("gcp");
      expect(status.authenticated).toBe(true);
    });
  });

  describe("reportResourceChanges", () => {
    it("emits resource change summary", () => {
      const changes: ResourceChangeSummary = {
        type: "resource:summary",
        provider: "gcp",
        created: 1,
        updated: 0,
        deleted: 0,
        failed: 0,
        resources: [],
      };
      emitter.reportResourceChanges(changes);

      expect(emitter.getLastStatus("resource:summary")).toEqual(changes);
    });
  });

  describe("estimateCost", () => {
    it("estimates cost based on resource type heuristics", () => {
      const actions: Action[] = [
        makeAction({ resourceType: "instance" }),
        makeAction({ resourceType: "database", id: "a2" }),
        makeAction({ resourceType: "bucket", id: "a3" }),
      ];

      const estimate = emitter.estimateCost(actions);

      expect(estimate.type).toBe("cost:estimate");
      expect(estimate.currency).toBe("USD");
      expect(estimate.costBreakdown).toHaveLength(3);
      expect(parseFloat(estimate.estimatedMonthlyCost!.slice(1))).toBeGreaterThan(0);
    });

    it("returns zero cost for empty actions", () => {
      const estimate = emitter.estimateCost([]);
      expect(estimate.estimatedMonthlyCost).toBe("$0.00");
      expect(estimate.costBreakdown).toEqual([]);
    });

    it("only includes create actions in cost estimate", () => {
      const actions: Action[] = [
        makeAction({ type: "create", resourceType: "instance" }),
        makeAction({ type: "read", resourceType: "instance", id: "a2" }),
        makeAction({ type: "delete", resourceType: "instance", id: "a3" }),
      ];

      const estimate = emitter.estimateCost(actions);
      expect(estimate.costBreakdown).toHaveLength(1);
    });

    it("uses fallback cost for unknown resource types", () => {
      const actions: Action[] = [
        makeAction({ resourceType: "custom-widget" }),
      ];

      const estimate = emitter.estimateCost(actions);
      expect(parseFloat(estimate.estimatedMonthlyCost!.slice(1))).toBe(10.0);
    });
  });

  describe("healthCheck", () => {
    it("reports connected providers", async () => {
      const provider = makeProvider("gcp");
      const health = await emitter.healthCheck([provider]);

      expect(health.type).toBe("health");
      expect(health.providers).toHaveLength(1);
      expect(health.providers[0].name).toBe("gcp");
      expect(health.providers[0].connected).toBe(true);
      expect(health.providers[0].latencyMs).toBeDefined();
    });

    it("reports disconnected providers", async () => {
      const provider: Provider = {
        name: "failing-provider",
        authenticate: vi.fn().mockRejectedValue(new Error("Connection refused")),
        listResources: vi.fn().mockResolvedValue([]),
        getTools: () => [],
        getCompositeTools: () => [],
      };

      const health = await emitter.healthCheck([provider]);

      expect(health.providers[0].connected).toBe(false);
      expect(health.providers[0].latencyMs).toBeDefined();
    });

    it("handles mixed connected and disconnected providers", async () => {
      const goodProvider = makeProvider("gcp");
      const badProvider: Provider = {
        name: "aws",
        authenticate: vi.fn().mockRejectedValue(new Error("timeout")),
        listResources: vi.fn().mockResolvedValue([]),
        getTools: () => [],
        getCompositeTools: () => [],
      };

      const health = await emitter.healthCheck([goodProvider, badProvider]);

      expect(health.providers).toHaveLength(2);
      const gcp = health.providers.find((p) => p.name === "gcp")!;
      const aws = health.providers.find((p) => p.name === "aws")!;
      expect(gcp.connected).toBe(true);
      expect(aws.connected).toBe(false);
    });

    it("stores health status for later retrieval", async () => {
      const provider = makeProvider("gcp");
      await emitter.healthCheck([provider]);

      const stored = emitter.getLastStatus("health") as ProviderHealth;
      expect(stored).toBeDefined();
      expect(stored.providers[0].name).toBe("gcp");
    });
  });
});
