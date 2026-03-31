import { describe, it, expect, vi, beforeEach } from "vitest";
import { DecisionGate } from "../decision-gate.js";
import { PlanEngine } from "../plan-engine.js";
import type {
  Action,
  AgentDecisionResponse,
  DecisionReview,
  Plan,
  Provider,
  Tool,
} from "../types.js";
import { Logger } from "../logger.js";

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: "action-1",
    type: "create",
    resourceType: "compute",
    provider: "gcp",
    params: {},
    description: "Create a compute instance",
    ...overrides,
  };
}

function makePlan(actions: Action[], id = "plan-1"): Plan {
  return {
    id,
    actions,
    status: "pending",
    results: [],
  };
}

function makeResponse(overrides: Partial<AgentDecisionResponse> = {}): AgentDecisionResponse {
  return {
    planId: "plan-1",
    confidence: 0.95,
    justification: "This is necessary for the deployment.",
    alternativesConsidered: ["Manual deployment", "Different region"],
    answers: {},
    ...overrides,
  };
}

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

const silentLogger = new Logger("error");

describe("DecisionGate", () => {
  let gate: DecisionGate;

  beforeEach(() => {
    gate = new DecisionGate();
  });

  describe("risk scoring", () => {
    it("scores a single create on compute as low risk", () => {
      const plan = makePlan([makeAction({ type: "create", resourceType: "compute" })]);
      const review = gate.review(plan);

      // create=1 * compute=2 = 2, single action no multipliers
      expect(review.riskScore).toBe(2);
      expect(review.riskAssessment).toBe("low");
    });

    it("scores an IAM delete as critical risk", () => {
      const plan = makePlan([makeAction({ type: "delete", resourceType: "iam" })]);
      const review = gate.review(plan);

      // delete=3 * iam=4 = 12, single action no multipliers
      expect(review.riskScore).toBe(12);
      expect(review.riskAssessment).toBe("high");
    });

    it("scores multiple IAM deletes as critical", () => {
      const plan = makePlan([
        makeAction({ id: "a1", type: "delete", resourceType: "iam" }),
        makeAction({ id: "a2", type: "delete", resourceType: "iam" }),
      ]);
      const review = gate.review(plan);

      // (3*4 + 3*4) = 24, * 1.5 (multiple resources) = 36
      expect(review.riskScore).toBe(36);
      expect(review.riskAssessment).toBe("critical");
    });

    it("applies mixed resource types multiplier", () => {
      const plan = makePlan([
        makeAction({ id: "a1", type: "create", resourceType: "compute" }),
        makeAction({ id: "a2", type: "create", resourceType: "storage" }),
      ]);
      const review = gate.review(plan);

      // (1*2 + 1*1) = 3, * 1.5 (multiple) * 1.2 (mixed) = 5.4
      expect(review.riskScore).toBe(5.4);
      expect(review.riskAssessment).toBe("medium");
    });

    it("scores an empty plan as zero / low", () => {
      const plan = makePlan([]);
      const review = gate.review(plan);

      expect(review.riskScore).toBe(0);
      expect(review.riskAssessment).toBe("low");
    });

    it("scores a single read as zero / low", () => {
      const plan = makePlan([makeAction({ type: "read", resourceType: "iam" })]);
      const review = gate.review(plan);

      // read=0 * iam=4 = 0
      expect(review.riskScore).toBe(0);
      expect(review.riskAssessment).toBe("low");
    });

    it("uses default weight of 1 for unknown resource types", () => {
      const plan = makePlan([makeAction({ type: "update", resourceType: "custom-widget" })]);
      const review = gate.review(plan);

      // update=2 * default=1 = 2
      expect(review.riskScore).toBe(2);
      expect(review.riskAssessment).toBe("low");
    });

    it("respects custom risk config", () => {
      const customGate = new DecisionGate({
        actionWeights: { delete: 10, update: 2, create: 1, read: 0 },
        thresholds: { low: 5, medium: 10, high: 20 },
      });
      const plan = makePlan([makeAction({ type: "delete", resourceType: "storage" })]);
      const review = customGate.review(plan);

      // delete=10 * storage=1 = 10
      expect(review.riskScore).toBe(10);
      expect(review.riskAssessment).toBe("medium");
    });
  });

  describe("question generation", () => {
    it("generates a single confirmation for low risk", () => {
      const plan = makePlan([makeAction({ type: "create", resourceType: "storage" })]);
      const review = gate.review(plan);

      expect(review.riskAssessment).toBe("low");
      expect(review.questions).toHaveLength(1);
      expect(review.questions[0]).toMatch(/confirm/i);
    });

    it("asks about outcome and reversibility for medium risk", () => {
      const plan = makePlan([
        makeAction({ id: "a1", type: "create", resourceType: "compute" }),
        makeAction({ id: "a2", type: "create", resourceType: "storage" }),
      ]);
      const review = gate.review(plan);

      expect(review.riskAssessment).toBe("medium");
      expect(review.questions).toHaveLength(2);
      expect(review.questions.some((q) => q.match(/expected outcome/i))).toBe(true);
      expect(review.questions.some((q) => q.match(/reversible/i))).toBe(true);
    });

    it("asks about alternatives, blast radius, and rollback for high risk", () => {
      // delete=3 * compute=2 = 6, * 1.5 (multiple) = 9 → high (7-12)
      const plan = makePlan([
        makeAction({ id: "a1", type: "delete", resourceType: "compute" }),
        makeAction({ id: "a2", type: "create", resourceType: "compute" }),
      ]);
      const review = gate.review(plan);

      expect(review.riskAssessment).toBe("high");
      expect(review.questions.some((q) => q.match(/alternatives/i))).toBe(true);
      expect(review.questions.some((q) => q.match(/blast radius/i))).toBe(true);
      expect(review.questions.some((q) => q.match(/rollback/i))).toBe(true);
    });

    it("asks critical questions including human review justification", () => {
      const plan = makePlan([
        makeAction({ id: "a1", type: "delete", resourceType: "iam" }),
        makeAction({ id: "a2", type: "delete", resourceType: "network" }),
      ]);
      const review = gate.review(plan);

      expect(review.riskAssessment).toBe("critical");
      expect(review.questions.some((q) => q.match(/human review/i))).toBe(true);
      expect(review.questions.some((q) => q.match(/security implications/i))).toBe(true);
    });

    it("adds delete-specific questions when deletes are present at high risk", () => {
      const plan = makePlan([
        makeAction({ id: "a1", type: "delete", resourceType: "compute" }),
        makeAction({ id: "a2", type: "delete", resourceType: "storage" }),
      ]);
      const review = gate.review(plan);

      expect(review.questions.some((q) => q.match(/no longer in use/i))).toBe(true);
    });
  });

  describe("affected resources and reversibility", () => {
    it("lists all affected resources", () => {
      const plan = makePlan([
        makeAction({ id: "a1", type: "create", resourceType: "compute", provider: "gcp", description: "Create VM" }),
        makeAction({ id: "a2", type: "delete", resourceType: "storage", provider: "gcp", description: "Remove bucket" }),
      ]);
      const review = gate.review(plan);

      expect(review.affectedResources).toHaveLength(2);
      expect(review.affectedResources[0]).toContain("create");
      expect(review.affectedResources[0]).toContain("gcp/compute");
      expect(review.affectedResources[1]).toContain("delete");
      expect(review.affectedResources[1]).toContain("gcp/storage");
    });

    it("marks plans with deletes as irreversible", () => {
      const plan = makePlan([makeAction({ type: "delete" })]);
      const review = gate.review(plan);
      expect(review.reversibility).toBe("irreversible");
    });

    it("marks plans with only updates as partially reversible", () => {
      const plan = makePlan([makeAction({ type: "update" })]);
      const review = gate.review(plan);
      expect(review.reversibility).toBe("partially");
    });

    it("marks plans with only creates as fully reversible", () => {
      const plan = makePlan([makeAction({ type: "create" })]);
      const review = gate.review(plan);
      expect(review.reversibility).toBe("fully");
    });

    it("marks plans with only reads as fully reversible", () => {
      const plan = makePlan([makeAction({ type: "read" })]);
      const review = gate.review(plan);
      expect(review.reversibility).toBe("fully");
    });
  });

  describe("evaluateResponse", () => {
    it("approves high-confidence response on low risk", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 1,
        riskAssessment: "low",
        questions: ["Confirm?"],
        affectedResources: [],
        reversibility: "fully",
      };
      const verdict = gate.evaluateResponse(review, makeResponse({ confidence: 0.5 }));
      expect(verdict.outcome).toBe("approved");
    });

    it("rejects very low confidence on low risk", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 1,
        riskAssessment: "low",
        questions: ["Confirm?"],
        affectedResources: [],
        reversibility: "fully",
      };
      const verdict = gate.evaluateResponse(review, makeResponse({ confidence: 0.2 }));
      expect(verdict.outcome).toBe("rejected");
      expect(verdict.reason).toContain("0.3");
    });

    it("rejects medium risk with low confidence", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 5,
        riskAssessment: "medium",
        questions: [],
        affectedResources: [],
        reversibility: "partially",
      };
      const verdict = gate.evaluateResponse(review, makeResponse({ confidence: 0.5 }));
      expect(verdict.outcome).toBe("rejected");
    });

    it("approves medium risk with sufficient confidence", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 5,
        riskAssessment: "medium",
        questions: [],
        affectedResources: [],
        reversibility: "partially",
      };
      const verdict = gate.evaluateResponse(review, makeResponse({ confidence: 0.7 }));
      expect(verdict.outcome).toBe("approved");
    });

    it("rejects high risk with no alternatives", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 10,
        riskAssessment: "high",
        questions: [],
        affectedResources: [],
        reversibility: "irreversible",
      };
      const verdict = gate.evaluateResponse(
        review,
        makeResponse({ confidence: 0.95, alternativesConsidered: [] })
      );
      expect(verdict.outcome).toBe("rejected");
      expect(verdict.reason).toContain("alternatives");
    });

    it("rejects high risk with low confidence", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 10,
        riskAssessment: "high",
        questions: [],
        affectedResources: [],
        reversibility: "irreversible",
      };
      const verdict = gate.evaluateResponse(review, makeResponse({ confidence: 0.7 }));
      expect(verdict.outcome).toBe("rejected");
      expect(verdict.reason).toContain("0.8");
    });

    it("escalates critical risk with missing justification", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 20,
        riskAssessment: "critical",
        questions: [],
        affectedResources: [],
        reversibility: "irreversible",
      };
      const verdict = gate.evaluateResponse(
        review,
        makeResponse({ justification: "", confidence: 0.95 })
      );
      expect(verdict.outcome).toBe("escalate");
      expect(verdict.reason).toContain("justification");
    });

    it("rejects critical risk with no alternatives", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 20,
        riskAssessment: "critical",
        questions: [],
        affectedResources: [],
        reversibility: "irreversible",
      };
      const verdict = gate.evaluateResponse(
        review,
        makeResponse({
          justification: "Necessary for security patch",
          alternativesConsidered: [],
          confidence: 0.95,
        })
      );
      expect(verdict.outcome).toBe("rejected");
      expect(verdict.reason).toContain("alternatives");
    });

    it("escalates critical risk with low confidence", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 20,
        riskAssessment: "critical",
        questions: [],
        affectedResources: [],
        reversibility: "irreversible",
      };
      const verdict = gate.evaluateResponse(
        review,
        makeResponse({
          justification: "Necessary",
          alternativesConsidered: ["Option B"],
          confidence: 0.85,
        })
      );
      expect(verdict.outcome).toBe("escalate");
      expect(verdict.reason).toContain("0.9");
    });

    it("approves critical risk when all criteria are met", () => {
      const review: DecisionReview = {
        planId: "p1",
        riskScore: 20,
        riskAssessment: "critical",
        questions: [],
        affectedResources: [],
        reversibility: "irreversible",
      };
      const verdict = gate.evaluateResponse(
        review,
        makeResponse({
          justification: "Critical security patch, downtime unacceptable",
          alternativesConsidered: ["Wait for maintenance window", "Partial patch"],
          confidence: 0.95,
        })
      );
      expect(verdict.outcome).toBe("approved");
    });
  });

  describe("integration with PlanEngine", () => {
    let provider: Provider;

    beforeEach(() => {
      provider = makeProvider("gcp", [
        makeTool("gcp:create:storage"),
        makeTool("gcp:delete:storage"),
        makeTool("gcp:create:compute"),
        makeTool("gcp:delete:compute"),
        makeTool("gcp:delete:iam"),
      ]);
    });

    it("blocks execution until review response is submitted", async () => {
      const engine = new PlanEngine([provider], silentLogger);
      const plan = engine.createPlan([
        makeAction({ type: "create", resourceType: "storage", provider: "gcp" }),
      ]);

      const executionPromise = engine.executePlan(plan);

      // Wait a tick so the gate:review event fires
      await new Promise((r) => setTimeout(r, 10));

      const review = engine.getReview(plan.id);
      expect(review).toBeDefined();
      expect(review!.riskAssessment).toBe("low");

      engine.submitReviewResponse(plan.id, makeResponse({ planId: plan.id }));

      const result = await executionPromise;
      expect(result.status).toBe("completed");
    });

    it("skips gate for low risk when autoApply is true", async () => {
      const engine = new PlanEngine([provider], silentLogger, { autoApply: true });
      const plan = engine.createPlan([
        makeAction({ type: "create", resourceType: "storage", provider: "gcp" }),
      ]);

      // Should complete without needing a review response
      const result = await engine.executePlan(plan);
      expect(result.status).toBe("completed");
    });

    it("still gates medium+ risk when autoApply is true", async () => {
      const engine = new PlanEngine([provider], silentLogger, { autoApply: true });
      const plan = engine.createPlan([
        makeAction({ id: "a1", type: "create", resourceType: "compute", provider: "gcp" }),
        makeAction({ id: "a2", type: "create", resourceType: "storage", provider: "gcp" }),
      ]);

      const executionPromise = engine.executePlan(plan);
      await new Promise((r) => setTimeout(r, 10));

      const review = engine.getReview(plan.id);
      expect(review).toBeDefined();
      expect(review!.riskAssessment).toBe("medium");

      engine.submitReviewResponse(plan.id, makeResponse({ planId: plan.id, confidence: 0.9 }));

      const result = await executionPromise;
      expect(result.status).toBe("completed");
    });

    it("rejects plan when verdict is rejected", async () => {
      const engine = new PlanEngine([provider], silentLogger);
      const plan = engine.createPlan([
        makeAction({ type: "delete", resourceType: "iam", provider: "gcp" }),
      ]);

      const executionPromise = engine.executePlan(plan);
      await new Promise((r) => setTimeout(r, 10));

      engine.submitReviewResponse(plan.id, makeResponse({
        planId: plan.id,
        confidence: 0.5,
        alternativesConsidered: [],
      }));

      const result = await executionPromise;
      expect(result.status).toBe("rejected");
      expect(result.results).toEqual([]);
    });

    it("emits gate:review and gate:verdict events", async () => {
      const engine = new PlanEngine([provider], silentLogger);
      const reviewSpy = vi.fn();
      const verdictSpy = vi.fn();
      engine.on("gate:review", reviewSpy);
      engine.on("gate:verdict", verdictSpy);

      const plan = engine.createPlan([
        makeAction({ type: "create", resourceType: "storage", provider: "gcp" }),
      ]);

      const executionPromise = engine.executePlan(plan);
      await new Promise((r) => setTimeout(r, 10));

      engine.submitReviewResponse(plan.id, makeResponse({ planId: plan.id }));
      await executionPromise;

      expect(reviewSpy).toHaveBeenCalledOnce();
      expect(verdictSpy).toHaveBeenCalledOnce();
      expect(verdictSpy.mock.calls[0][0].outcome).toBe("approved");
    });

    it("emits gate:escalate for escalated verdicts", async () => {
      const engine = new PlanEngine([provider], silentLogger);
      const escalateSpy = vi.fn();
      engine.on("gate:escalate", escalateSpy);

      const plan = engine.createPlan([
        makeAction({ id: "a1", type: "delete", resourceType: "iam", provider: "gcp" }),
        makeAction({ id: "a2", type: "delete", resourceType: "iam", provider: "gcp" }),
      ]);

      const executionPromise = engine.executePlan(plan);
      await new Promise((r) => setTimeout(r, 10));

      engine.submitReviewResponse(plan.id, makeResponse({
        planId: plan.id,
        justification: "",
        confidence: 0.95,
      }));

      const result = await executionPromise;
      expect(result.status).toBe("rejected");
      expect(escalateSpy).toHaveBeenCalledOnce();
    });

    it("throws when submitting response for non-existent review", () => {
      const engine = new PlanEngine([provider], silentLogger);
      expect(() => {
        engine.submitReviewResponse("nonexistent", makeResponse());
      }).toThrow("No pending review");
    });
  });

  describe("edge cases", () => {
    it("handles empty plan gracefully", () => {
      const plan = makePlan([]);
      const review = gate.review(plan);

      expect(review.riskScore).toBe(0);
      expect(review.riskAssessment).toBe("low");
      expect(review.affectedResources).toEqual([]);
      expect(review.reversibility).toBe("fully");
      expect(review.questions).toHaveLength(1);
    });

    it("handles single-action plan correctly", () => {
      const plan = makePlan([makeAction({ type: "update", resourceType: "network" })]);
      const review = gate.review(plan);

      // update=2 * network=3 = 6, single action
      expect(review.riskScore).toBe(6);
      expect(review.riskAssessment).toBe("medium");
      expect(review.affectedResources).toHaveLength(1);
      expect(review.reversibility).toBe("partially");
    });

    it("handles plan with only read actions", () => {
      const plan = makePlan([
        makeAction({ id: "a1", type: "read", resourceType: "iam" }),
        makeAction({ id: "a2", type: "read", resourceType: "network" }),
      ]);
      const review = gate.review(plan);

      expect(review.riskScore).toBe(0);
      expect(review.riskAssessment).toBe("low");
    });
  });
});
