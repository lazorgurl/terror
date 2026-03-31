import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PlanEngine } from "./plan-engine.js";
import type {
  Action,
  AuthStatusUpdate,
  CostEstimate,
  Plan,
  PlanProgress,
  Provider,
  ProviderHealth,
  ResourceChangeSummary,
  StatusUpdate,
} from "./types.js";

const NOTIFICATION_METHOD = "terror/status";

const RESOURCE_COST_HEURISTICS: Record<string, number> = {
  instance: 25.0,
  vm: 30.0,
  database: 50.0,
  bucket: 2.0,
  storage: 5.0,
  network: 10.0,
  loadbalancer: 18.0,
  cluster: 100.0,
  function: 1.5,
  queue: 3.0,
  topic: 1.0,
  dns: 0.5,
  certificate: 0.0,
  secret: 0.1,
};

function estimateResourceCost(resourceType: string): number {
  const lower = resourceType.toLowerCase();
  for (const [key, cost] of Object.entries(RESOURCE_COST_HEURISTICS)) {
    if (lower.includes(key)) return cost;
  }
  return 10.0;
}

export class StatusEmitter {
  private mcpServer: McpServer | undefined;
  private lastStatusByType = new Map<string, StatusUpdate>();

  constructor(mcpServer?: McpServer) {
    this.mcpServer = mcpServer;
  }

  emitStatus(update: StatusUpdate): void {
    this.lastStatusByType.set(update.type, update);

    if (!this.mcpServer) return;

    this.mcpServer.server
      .notification({
        method: NOTIFICATION_METHOD,
        params: update as unknown as Record<string, unknown>,
      })
      .catch(() => {
        // Notification delivery is best-effort; swallow errors
      });
  }

  getLastStatus(type: StatusUpdate["type"]): StatusUpdate | undefined {
    return this.lastStatusByType.get(type);
  }

  getAllStatuses(): StatusUpdate[] {
    return Array.from(this.lastStatusByType.values());
  }

  startPlanTracking(plan: Plan, engine: PlanEngine): void {
    let completedActions = 0;
    let failedActions = 0;
    let rolledBackActions = 0;
    let currentAction = 0;

    const emitProgress = (phase: PlanProgress["phase"]) => {
      this.emitStatus({
        type: "plan:progress",
        planId: plan.id,
        currentAction,
        totalActions: plan.actions.length,
        completedActions,
        failedActions,
        rolledBackActions,
        phase,
      });
    };

    emitProgress("validating");

    engine.on("action:start", () => {
      currentAction++;
      emitProgress("executing");
    });

    engine.on("action:complete", () => {
      completedActions++;
      emitProgress("executing");
    });

    engine.on("action:failed", () => {
      failedActions++;
      emitProgress("executing");
    });

    engine.on("plan:rollback", () => {
      rolledBackActions = plan.results.filter(
        (r) => r.status === "rolled-back"
      ).length;
      emitProgress("rolling-back");
    });

    engine.on("plan:complete", () => {
      emitProgress("complete");
    });
  }

  reportAuth(provider: string, status: Omit<AuthStatusUpdate, "type" | "provider">): void {
    this.emitStatus({
      type: "auth:status",
      provider,
      ...status,
    });
  }

  reportResourceChanges(changes: ResourceChangeSummary): void {
    this.emitStatus(changes);
  }

  estimateCost(actions: Action[]): CostEstimate {
    const createActions = actions.filter((a) => a.type === "create");
    const breakdown = createActions.map((a) => {
      const cost = estimateResourceCost(a.resourceType);
      return {
        resource: `${a.provider}/${a.resourceType}`,
        monthlyCost: `$${cost.toFixed(2)}`,
      };
    });

    const total = breakdown.reduce(
      (sum, item) => sum + parseFloat(item.monthlyCost.slice(1)),
      0
    );

    const provider =
      createActions.length > 0 ? createActions[0].provider : "unknown";

    const estimate: CostEstimate = {
      type: "cost:estimate",
      provider,
      estimatedMonthlyCost: `$${total.toFixed(2)}`,
      costBreakdown: breakdown,
      currency: "USD",
    };

    this.emitStatus(estimate);
    return estimate;
  }

  async healthCheck(providers: Provider[]): Promise<ProviderHealth> {
    const entries = await Promise.all(
      providers.map(async (p) => {
        const start = Date.now();
        try {
          await p.authenticate();
          return {
            name: p.name,
            connected: true,
            latencyMs: Date.now() - start,
            lastChecked: new Date().toISOString(),
          };
        } catch {
          return {
            name: p.name,
            connected: false,
            latencyMs: Date.now() - start,
            lastChecked: new Date().toISOString(),
          };
        }
      })
    );

    const health: ProviderHealth = {
      type: "health",
      providers: entries,
    };

    this.emitStatus(health);
    return health;
  }
}
