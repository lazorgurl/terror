import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanEngine } from "../plan-engine.js";
import type { Action, Provider, Tool } from "../types.js";
import { Logger } from "../logger.js";

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

function autoApprove(engine: PlanEngine) {
  engine.on("gate:review", (review) => {
    engine.submitReviewResponse(review.planId, {
      planId: review.planId,
      confidence: 0.99,
      justification: "Test auto-approval",
      alternativesConsidered: ["None needed"],
      answers: {},
    });
  });
}

describe("PlanEngine", () => {
  let provider: Provider;
  let engine: PlanEngine;

  beforeEach(() => {
    provider = makeProvider("test-provider", [
      makeTool("test-provider:create:instance"),
      makeTool("test-provider:delete:instance"),
      makeTool("test-provider:read:instance"),
    ]);
    engine = new PlanEngine([provider], silentLogger);
    autoApprove(engine);
  });

  describe("createPlan", () => {
    it("creates a plan with pending status and the given actions", () => {
      const actions = [makeAction(), makeAction({ id: "action-2" })];
      const plan = engine.createPlan(actions);

      expect(plan.id).toBeDefined();
      expect(plan.status).toBe("pending");
      expect(plan.actions).toHaveLength(2);
      expect(plan.results).toEqual([]);
    });
  });

  describe("validateAction", () => {
    it("passes validation for a valid action", async () => {
      const result = await engine.validateAction(makeAction());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails if provider is not registered", async () => {
      const result = await engine.validateAction(
        makeAction({ provider: "nonexistent" })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Provider "nonexistent" is not registered'
      );
    });

    it("fails if the matching tool does not exist", async () => {
      const result = await engine.validateAction(
        makeAction({ resourceType: "database" })
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("No tool");
    });
  });

  describe("executePlan", () => {
    it("executes all actions sequentially and completes the plan", async () => {
      const handler = vi.fn().mockResolvedValue({ id: "res-1" });
      provider = makeProvider("test-provider", [
        makeTool("test-provider:create:instance", handler),
        makeTool("test-provider:delete:instance"),
      ]);
      engine = new PlanEngine([provider], silentLogger);
      autoApprove(engine);

      const plan = engine.createPlan([
        makeAction({ id: "a1" }),
        makeAction({ id: "a2" }),
      ]);

      const result = await engine.executePlan(plan);

      expect(result.status).toBe("completed");
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe("success");
      expect(result.results[1].status).toBe("success");
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("emits action:start and action:complete events", async () => {
      const startSpy = vi.fn();
      const completeSpy = vi.fn();
      engine.on("action:start", startSpy);
      engine.on("action:complete", completeSpy);

      const plan = engine.createPlan([makeAction()]);
      await engine.executePlan(plan);

      expect(startSpy).toHaveBeenCalledOnce();
      expect(completeSpy).toHaveBeenCalledOnce();
    });

    it("emits plan:complete on success", async () => {
      const spy = vi.fn();
      engine.on("plan:complete", spy);

      const plan = engine.createPlan([makeAction()]);
      await engine.executePlan(plan);

      expect(spy).toHaveBeenCalledOnce();
    });

    it("halts and rolls back on action failure", async () => {
      const successHandler = vi.fn().mockResolvedValue({ id: "res-1" });
      const failHandler = vi.fn().mockRejectedValue(new Error("Boom"));
      const deleteHandler = vi.fn().mockResolvedValue(undefined);

      provider = makeProvider("test-provider", [
        makeTool("test-provider:create:instance", successHandler),
        makeTool("test-provider:delete:instance", deleteHandler),
        makeTool("test-provider:update:instance", failHandler),
      ]);
      engine = new PlanEngine([provider], silentLogger);
      autoApprove(engine);

      const plan = engine.createPlan([
        makeAction({ id: "a1", type: "create" }),
        makeAction({ id: "a2", type: "update", resourceType: "instance" }),
        makeAction({ id: "a3", type: "create" }),
      ]);

      const result = await engine.executePlan(plan);

      expect(result.status).toBe("rolled-back");
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe("rolled-back");
      expect(result.results[1].status).toBe("failed");
      expect(result.results[1].error).toBe("Boom");
      expect(deleteHandler).toHaveBeenCalledOnce();
    });

    it("halts execution on pre-validation failure", async () => {
      const handler = vi.fn().mockResolvedValue({ id: "res-1" });
      const deleteHandler = vi.fn().mockResolvedValue(undefined);
      provider = makeProvider("test-provider", [
        makeTool("test-provider:create:instance", handler),
        makeTool("test-provider:delete:instance", deleteHandler),
      ]);
      engine = new PlanEngine([provider], silentLogger);
      autoApprove(engine);

      const plan = engine.createPlan([
        makeAction({ id: "a1" }),
        makeAction({ id: "a2", resourceType: "nonexistent" }),
      ]);

      const result = await engine.executePlan(plan);

      expect(result.status).toBe("rolled-back");
      expect(handler).toHaveBeenCalledOnce();
      expect(result.results[0].status).toBe("rolled-back");
      expect(result.results[1].error).toContain("Pre-validation failed");
    });
  });

  describe("rollback", () => {
    it("rolls back completed actions in reverse order", async () => {
      const callOrder: string[] = [];
      const createHandler = vi.fn().mockImplementation(async () => {
        callOrder.push("create");
        return { id: "res-1" };
      });
      const deleteHandler = vi.fn().mockImplementation(async () => {
        callOrder.push("delete");
      });
      const failHandler = vi.fn().mockRejectedValue(new Error("Fail"));

      provider = makeProvider("test-provider", [
        makeTool("test-provider:create:instance", createHandler),
        makeTool("test-provider:delete:instance", deleteHandler),
        makeTool("test-provider:read:instance", failHandler),
      ]);
      engine = new PlanEngine([provider], silentLogger);
      autoApprove(engine);

      const plan = engine.createPlan([
        makeAction({ id: "a1", type: "create" }),
        makeAction({ id: "a2", type: "create" }),
        makeAction({ id: "a3", type: "read" }),
      ]);

      const result = await engine.executePlan(plan);

      expect(result.status).toBe("rolled-back");
      expect(callOrder.filter((c) => c === "delete")).toHaveLength(2);
    });

    it("emits plan:rollback event", async () => {
      const failHandler = vi.fn().mockRejectedValue(new Error("Fail"));
      provider = makeProvider("test-provider", [
        makeTool("test-provider:create:instance"),
        makeTool("test-provider:delete:instance"),
        makeTool("test-provider:read:instance", failHandler),
      ]);
      engine = new PlanEngine([provider], silentLogger);
      autoApprove(engine);

      const spy = vi.fn();
      engine.on("plan:rollback", spy);

      const plan = engine.createPlan([
        makeAction({ id: "a1", type: "create" }),
        makeAction({ id: "a2", type: "read" }),
      ]);

      await engine.executePlan(plan);
      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
