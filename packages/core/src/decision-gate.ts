import type {
  Action,
  ActionType,
  AgentDecisionResponse,
  DecisionReview,
  DecisionVerdict,
  Plan,
  Reversibility,
  RiskConfig,
  RiskLevel,
} from "./types.js";

const DEFAULT_RISK_CONFIG: RiskConfig = {
  actionWeights: {
    delete: 3,
    update: 2,
    create: 1,
    read: 0,
  },
  resourceWeights: {
    iam: 4,
    network: 3,
    "cloud-sql": 3,
    compute: 2,
    "cloud-run": 2,
    storage: 1,
    pubsub: 1,
    "cloud-functions": 1,
  },
  multipleResourcesMultiplier: 1.5,
  mixedResourceTypesMultiplier: 1.2,
  thresholds: { low: 3, medium: 6, high: 12 },
};

export class DecisionGate {
  private config: RiskConfig;

  constructor(config?: Partial<RiskConfig>) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
    if (config?.actionWeights) {
      this.config.actionWeights = { ...DEFAULT_RISK_CONFIG.actionWeights, ...config.actionWeights };
    }
    if (config?.resourceWeights) {
      this.config.resourceWeights = { ...DEFAULT_RISK_CONFIG.resourceWeights, ...config.resourceWeights };
    }
    if (config?.thresholds) {
      this.config.thresholds = { ...DEFAULT_RISK_CONFIG.thresholds, ...config.thresholds };
    }
  }

  review(plan: Plan): DecisionReview {
    const riskScore = this.computeRiskScore(plan.actions);
    const riskAssessment = this.scoreToLevel(riskScore);
    const affectedResources = this.summarizeAffectedResources(plan.actions);
    const reversibility = this.assessReversibility(plan.actions);
    const questions = this.generateQuestions(riskAssessment, plan.actions);

    return {
      planId: plan.id,
      riskScore,
      riskAssessment,
      questions,
      affectedResources,
      reversibility,
    };
  }

  evaluateResponse(
    review: DecisionReview,
    response: AgentDecisionResponse
  ): DecisionVerdict {
    const { riskAssessment } = review;
    const { confidence, justification, alternativesConsidered } = response;

    if (riskAssessment === "critical") {
      if (!justification || justification.trim().length === 0) {
        return {
          outcome: "escalate",
          reason: "Critical-risk plan requires justification. Escalating for human review.",
        };
      }
      if (alternativesConsidered.length === 0) {
        return {
          outcome: "rejected",
          reason: "Critical-risk plan rejected: no alternatives were considered.",
        };
      }
      if (confidence < 0.9) {
        return {
          outcome: "escalate",
          reason: `Confidence ${confidence} is below 0.9 threshold for critical-risk actions. Escalating for human review.`,
        };
      }
    }

    if (riskAssessment === "high") {
      if (alternativesConsidered.length === 0) {
        return {
          outcome: "rejected",
          reason: "High-risk plan rejected: no alternatives were considered.",
        };
      }
      if (confidence < 0.8) {
        return {
          outcome: "rejected",
          reason: `Confidence ${confidence} is below 0.8 threshold for high-risk actions.`,
        };
      }
    }

    if (riskAssessment === "medium" && confidence < 0.6) {
      return {
        outcome: "rejected",
        reason: `Confidence ${confidence} is below 0.6 threshold for medium-risk actions.`,
      };
    }

    if (riskAssessment === "low" && confidence < 0.3) {
      return {
        outcome: "rejected",
        reason: `Confidence ${confidence} is below 0.3 threshold for low-risk actions.`,
      };
    }

    return { outcome: "approved", reason: "Decision review passed." };
  }

  private computeRiskScore(actions: Action[]): number {
    if (actions.length === 0) return 0;

    let baseScore = 0;
    for (const action of actions) {
      const actionWeight = this.config.actionWeights[action.type] ?? 0;
      const resourceWeight = this.config.resourceWeights[action.resourceType] ?? 1;
      baseScore += actionWeight * resourceWeight;
    }

    const resourceTypes = new Set(actions.map((a) => a.resourceType));
    if (actions.length > 1) {
      baseScore *= this.config.multipleResourcesMultiplier;
    }
    if (resourceTypes.size > 1) {
      baseScore *= this.config.mixedResourceTypesMultiplier;
    }

    return Math.round(baseScore * 100) / 100;
  }

  private scoreToLevel(score: number): RiskLevel {
    const { thresholds } = this.config;
    if (score < thresholds.low) return "low";
    if (score <= thresholds.medium) return "medium";
    if (score <= thresholds.high) return "high";
    return "critical";
  }

  private summarizeAffectedResources(actions: Action[]): string[] {
    return actions.map(
      (a) => `${a.type} ${a.provider}/${a.resourceType}${a.description ? ` — ${a.description}` : ""}`
    );
  }

  private assessReversibility(actions: Action[]): Reversibility {
    const hasDelete = actions.some((a) => a.type === "delete");
    const hasUpdate = actions.some((a) => a.type === "update");

    if (hasDelete) return "irreversible";
    if (hasUpdate) return "partially";
    return "fully";
  }

  private generateQuestions(level: RiskLevel, actions: Action[]): string[] {
    const questions: string[] = [];

    switch (level) {
      case "low":
        questions.push("Confirm you want to proceed with this plan.");
        break;

      case "medium":
        questions.push("What is the expected outcome of this plan?");
        questions.push("Is this change reversible? If not, what is the recovery path?");
        break;

      case "high":
        questions.push("What alternatives did you consider before choosing this approach?");
        questions.push("What is the blast radius if something goes wrong?");
        questions.push("What is the rollback plan?");
        if (actions.some((a) => a.type === "delete")) {
          questions.push("Have you verified that the resources being deleted are no longer in use?");
        }
        break;

      case "critical":
        questions.push("What alternatives did you consider before choosing this approach?");
        questions.push("What is the blast radius if something goes wrong?");
        questions.push("What is the rollback plan?");
        questions.push("Explain why this action cannot wait for a human review.");
        if (actions.some((a) => a.type === "delete")) {
          questions.push("Have you verified that the resources being deleted are no longer in use?");
        }
        if (actions.some((a) => a.resourceType === "iam" || a.resourceType === "network")) {
          questions.push("Have you assessed the security implications of this change?");
        }
        break;
    }

    return questions;
  }
}
