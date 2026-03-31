import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  Action,
  ActionResult,
  AgentDecisionResponse,
  DecisionReview,
  DecisionVerdict,
  Plan,
  Provider,
  ValidationResult,
} from "./types.js";
import { DecisionGate } from "./decision-gate.js";
import { Logger } from "./logger.js";
import type { StatusEmitter } from "./status-emitter.js";

export interface PlanEngineEvents {
  "action:start": [action: Action];
  "action:complete": [action: Action, result: ActionResult];
  "action:failed": [action: Action, result: ActionResult];
  "plan:complete": [plan: Plan];
  "plan:rollback": [plan: Plan];
  "gate:review": [review: DecisionReview];
  "gate:verdict": [verdict: DecisionVerdict];
  "gate:escalate": [review: DecisionReview, verdict: DecisionVerdict];
}

export class PlanEngine extends EventEmitter<PlanEngineEvents> {
  private providers: Map<string, Provider>;
  private logger: Logger;
  readonly decisionGate: DecisionGate;
  private autoApply: boolean;
  private statusEmitter: StatusEmitter | undefined;
  private pendingReviews = new Map<
    string,
    {
      review: DecisionReview;
      resolve: (response: AgentDecisionResponse) => void;
    }
  >();

  constructor(
    providers: Provider[],
    logger?: Logger,
    options?: { decisionGate?: DecisionGate; autoApply?: boolean; statusEmitter?: StatusEmitter }
  ) {
    super();
    this.providers = new Map(providers.map((p) => [p.name, p]));
    this.logger = logger ?? new Logger("info");
    this.decisionGate = options?.decisionGate ?? new DecisionGate();
    this.autoApply = options?.autoApply ?? false;
    this.statusEmitter = options?.statusEmitter;
  }

  getReview(planId: string): DecisionReview | undefined {
    return this.pendingReviews.get(planId)?.review;
  }

  submitReviewResponse(planId: string, response: AgentDecisionResponse): void {
    const pending = this.pendingReviews.get(planId);
    if (!pending) {
      throw new Error(`No pending review for plan ${planId}`);
    }
    pending.resolve(response);
    this.pendingReviews.delete(planId);
  }

  createPlan(actions: Action[]): Plan {
    const plan: Plan = {
      id: randomUUID(),
      actions,
      status: "pending",
      results: [],
    };
    this.logger.info("Plan created", { planId: plan.id, actionCount: actions.length });
    return plan;
  }

  async validateAction(action: Action): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!action.id) errors.push("Action must have an id");
    if (!action.type) errors.push("Action must have a type");
    if (!action.resourceType) errors.push("Action must have a resourceType");
    if (!action.provider) errors.push("Action must have a provider");

    const provider = this.providers.get(action.provider);
    if (!provider) {
      errors.push(`Provider "${action.provider}" is not registered`);
      return { valid: false, errors };
    }

    const tools = [...provider.getTools(), ...provider.getCompositeTools()];
    const toolName = `${action.provider}:${action.type}:${action.resourceType}`;
    const hasTool = tools.some((t) => t.name === toolName);
    if (!hasTool) {
      errors.push(
        `No tool "${toolName}" found for provider "${action.provider}"`
      );
    }

    return { valid: errors.length === 0, errors };
  }

  async executePlan(plan: Plan): Promise<Plan> {
    const review = this.decisionGate.review(plan);

    const skipGate = this.autoApply && review.riskAssessment === "low";

    if (!skipGate) {
      const response = await new Promise<AgentDecisionResponse>((resolve) => {
        this.pendingReviews.set(plan.id, { review, resolve });
        this.emit("gate:review", review);
        this.logger.info("Decision gate review", {
          planId: plan.id,
          risk: review.riskAssessment,
          score: review.riskScore,
        });
      });

      const verdict = this.decisionGate.evaluateResponse(review, response);
      this.emit("gate:verdict", verdict);
      this.logger.info("Decision gate verdict", {
        planId: plan.id,
        outcome: verdict.outcome,
        reason: verdict.reason,
      });

      if (verdict.outcome === "escalate") {
        this.emit("gate:escalate", review, verdict);
        plan.status = "rejected";
        plan.results = [];
        return plan;
      }

      if (verdict.outcome === "rejected") {
        plan.status = "rejected";
        plan.results = [];
        return plan;
      }
    } else {
      this.logger.info("Decision gate skipped (autoApply + low risk)", {
        planId: plan.id,
      });
    }

    plan.status = "executing";
    plan.results = [];

    if (this.statusEmitter) {
      this.statusEmitter.startPlanTracking(plan, this);
    }

    this.logger.info("Executing plan", { planId: plan.id });

    for (const action of plan.actions) {
      const preValidation = await this.validateAction(action);
      if (!preValidation.valid) {
        const result: ActionResult = {
          actionId: action.id,
          status: "failed",
          error: `Pre-validation failed: ${preValidation.errors.join(", ")}`,
        };
        plan.results.push(result);
        plan.status = "failed";
        this.emit("action:failed", action, result);
        this.logger.error("Action pre-validation failed", {
          planId: plan.id,
          actionId: action.id,
          errors: preValidation.errors,
        });
        await this.rollback(plan);
        return plan;
      }

      this.emit("action:start", action);
      this.logger.info("Action started", {
        planId: plan.id,
        actionId: action.id,
        type: action.type,
      });

      try {
        const provider = this.providers.get(action.provider)!;
        const tools = [...provider.getTools(), ...provider.getCompositeTools()];
        const toolName = `${action.provider}:${action.type}:${action.resourceType}`;
        const tool = tools.find((t) => t.name === toolName)!;

        const resource = await tool.handler(action.params);

        const result: ActionResult = {
          actionId: action.id,
          status: "success",
          resource: resource as ActionResult["resource"],
          rollbackAction: this.buildRollbackAction(action),
        };
        plan.results.push(result);
        this.emit("action:complete", action, result);
        this.logger.info("Action completed", {
          planId: plan.id,
          actionId: action.id,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const result: ActionResult = {
          actionId: action.id,
          status: "failed",
          error,
        };
        plan.results.push(result);
        plan.status = "failed";
        this.emit("action:failed", action, result);
        this.logger.error("Action failed", {
          planId: plan.id,
          actionId: action.id,
          error,
        });
        await this.rollback(plan);
        return plan;
      }
    }

    plan.status = "completed";
    this.emit("plan:complete", plan);
    this.logger.info("Plan completed", { planId: plan.id });

    if (this.statusEmitter) {
      this.emitResourceChangeSummary(plan);
    }

    return plan;
  }

  async rollback(plan: Plan): Promise<Plan> {
    this.logger.info("Rolling back plan", { planId: plan.id });

    const completedResults = plan.results.filter(
      (r) => r.status === "success" && r.rollbackAction
    );

    for (const result of completedResults.reverse()) {
      const rollbackAction = result.rollbackAction!;
      try {
        const provider = this.providers.get(rollbackAction.provider);
        if (!provider) {
          this.logger.warn("Cannot rollback: provider not found", {
            provider: rollbackAction.provider,
          });
          continue;
        }

        const tools = [...provider.getTools(), ...provider.getCompositeTools()];
        const toolName = `${rollbackAction.provider}:${rollbackAction.type}:${rollbackAction.resourceType}`;
        const tool = tools.find((t) => t.name === toolName);

        if (tool) {
          await tool.handler(rollbackAction.params);
          result.status = "rolled-back";
          this.logger.info("Action rolled back", {
            actionId: result.actionId,
          });
        } else {
          this.logger.warn("Cannot rollback: tool not found", { toolName });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.logger.error("Rollback failed for action", {
          actionId: result.actionId,
          error,
        });
      }
    }

    plan.status = "rolled-back";
    this.emit("plan:rollback", plan);
    this.logger.info("Plan rolled back", { planId: plan.id });
    return plan;
  }

  private emitResourceChangeSummary(plan: Plan): void {
    const byProvider = new Map<string, { created: number; updated: number; deleted: number; failed: number; resources: Array<{ type: string; name: string; action: Action["type"]; status: "success" | "failed" | "pending" }> }>();

    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i];
      const result = plan.results[i];
      if (!result) continue;

      let entry = byProvider.get(action.provider);
      if (!entry) {
        entry = { created: 0, updated: 0, deleted: 0, failed: 0, resources: [] };
        byProvider.set(action.provider, entry);
      }

      const status = result.status === "success" ? "success" as const : "failed" as const;
      if (result.status === "failed") {
        entry.failed++;
      } else if (action.type === "create") {
        entry.created++;
      } else if (action.type === "update") {
        entry.updated++;
      } else if (action.type === "delete") {
        entry.deleted++;
      }

      entry.resources.push({
        type: action.resourceType,
        name: action.description,
        action: action.type,
        status,
      });
    }

    for (const [provider, entry] of byProvider) {
      this.statusEmitter!.reportResourceChanges({
        type: "resource:summary",
        provider,
        ...entry,
      });
    }
  }

  private buildRollbackAction(action: Action): Action | undefined {
    switch (action.type) {
      case "create":
        return {
          id: randomUUID(),
          type: "delete",
          resourceType: action.resourceType,
          provider: action.provider,
          params: action.params,
          description: `Rollback: delete ${action.resourceType} created by ${action.id}`,
        };
      case "delete":
        return {
          id: randomUUID(),
          type: "create",
          resourceType: action.resourceType,
          provider: action.provider,
          params: action.params,
          description: `Rollback: recreate ${action.resourceType} deleted by ${action.id}`,
        };
      case "update":
        return undefined;
      case "read":
        return undefined;
    }
  }
}
