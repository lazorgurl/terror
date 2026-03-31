import { describe, it, expect, beforeEach } from "vitest";
import { TuiFormatter } from "../tui-formatter.js";
import { strip } from "../theme.js";
import type {
  AuthStatusUpdate,
  CostEstimate,
  GateStatus,
  PlanProgress,
  ProviderHealth,
  ResourceChangeSummary,
  StatusUpdate,
} from "../types.js";

describe("TuiFormatter", () => {
  let formatter: TuiFormatter;

  beforeEach(() => {
    formatter = new TuiFormatter();
  });

  describe("formatProgressBar", () => {
    it("renders 0%", () => {
      const bar = formatter.formatProgressBar(0, 10, 7);
      expect(strip(bar.toString())).toBe("\u2591\u2591\u2591\u2591\u2591\u2591\u2591");
    });

    it("renders 100%", () => {
      const bar = formatter.formatProgressBar(10, 10, 7);
      expect(strip(bar.toString())).toBe("\u2588\u2588\u2588\u2588\u2588\u2588\u2588");
    });

    it("renders approximately 50%", () => {
      const bar = formatter.formatProgressBar(5, 10, 10);
      const str = strip(bar.toString());
      expect(str.length).toBe(10);
      const filled = (str.match(/\u2588/g) || []).length;
      expect(filled).toBe(5);
    });

    it("handles total of 0 gracefully", () => {
      const bar = formatter.formatProgressBar(0, 0, 5);
      expect(strip(bar.toString())).toBe("\u2591\u2591\u2591\u2591\u2591");
    });

    it("clamps values above total", () => {
      const bar = formatter.formatProgressBar(15, 10, 5);
      expect(strip(bar.toString())).toBe("\u2588\u2588\u2588\u2588\u2588");
    });

    it("handles fractional progress", () => {
      const bar = formatter.formatProgressBar(1, 3, 9);
      const str = strip(bar.toString());
      expect(str.length).toBe(9);
      const filled = (str.match(/\u2588/g) || []).length;
      expect(filled).toBe(3);
    });

    it("uses default width of 7", () => {
      const bar = formatter.formatProgressBar(3, 7);
      expect(strip(bar.toString()).length).toBe(7);
    });

    it("includes ANSI color codes in raw output", () => {
      const bar = formatter.formatProgressBar(5, 10, 10);
      const raw = bar.toString();
      expect(raw).toContain("\x1b[");
      expect(raw.length).toBeGreaterThan(strip(raw).length);
    });
  });

  describe("formatStatusLine", () => {
    it("formats PlanProgress", () => {
      const update: PlanProgress = {
        type: "plan:progress",
        planId: "p1",
        currentAction: 3,
        totalActions: 7,
        completedActions: 3,
        failedActions: 0,
        rolledBackActions: 0,
        phase: "executing",
      };
      const line = formatter.formatStatusLine(update);
      const plain = strip(line);
      expect(plain).toContain("\u25B6");
      expect(plain).toContain("3/7");
      expect(plain).toContain("executing");
      expect(plain).toContain("0 failed");
    });

    it("formats PlanProgress with failures", () => {
      const update: PlanProgress = {
        type: "plan:progress",
        planId: "p1",
        currentAction: 5,
        totalActions: 7,
        completedActions: 4,
        failedActions: 1,
        rolledBackActions: 0,
        phase: "executing",
      };
      const line = formatter.formatStatusLine(update);
      expect(strip(line)).toContain("1 failed");
    });

    it("formats AuthStatus when authenticated", () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const update: AuthStatusUpdate = {
        type: "auth:status",
        provider: "gcp",
        authenticated: true,
        expiresAt: futureDate,
      };
      const line = formatter.formatStatusLine(update);
      const plain = strip(line);
      expect(plain).toContain("\uD83D\uDD11");
      expect(plain).toContain("gcp");
      expect(plain).toContain("authenticated");
      expect(plain).toContain("expires");
    });

    it("formats AuthStatus when not authenticated", () => {
      const update: AuthStatusUpdate = {
        type: "auth:status",
        provider: "aws",
        authenticated: false,
      };
      const line = formatter.formatStatusLine(update);
      expect(strip(line)).toContain("not authenticated");
    });

    it("formats ResourceChangeSummary", () => {
      const update: ResourceChangeSummary = {
        type: "resource:summary",
        provider: "gcp",
        created: 2,
        updated: 1,
        deleted: 0,
        failed: 0,
        resources: [],
      };
      const line = formatter.formatStatusLine(update);
      const plain = strip(line);
      expect(plain).toContain("\u0394");
      expect(plain).toContain("+2");
      expect(plain).toContain("~1");
      expect(plain).toContain("-0");
    });

    it("formats CostEstimate", () => {
      const update: CostEstimate = {
        type: "cost:estimate",
        provider: "aws",
        estimatedMonthlyCost: "$12.50",
        currency: "USD",
      };
      const line = formatter.formatStatusLine(update);
      const plain = strip(line);
      expect(plain).toContain("\uD83D\uDCB0");
      expect(plain).toContain("$12.50");
      expect(plain).toContain("/mo");
    });

    it("formats GateStatus awaiting review", () => {
      const update: GateStatus = {
        type: "gate:status",
        planId: "p1",
        riskLevel: "high",
        waitingForReview: true,
      };
      const line = formatter.formatStatusLine(update);
      const plain = strip(line);
      expect(plain).toContain("\u26A0");
      expect(plain).toContain("HIGH");
      expect(plain).toContain("awaiting review");
    });

    it("formats GateStatus with verdict", () => {
      const update: GateStatus = {
        type: "gate:status",
        planId: "p1",
        riskLevel: "low",
        verdict: "approved",
        waitingForReview: false,
      };
      const line = formatter.formatStatusLine(update);
      const plain = strip(line);
      expect(plain).toContain("LOW");
      expect(plain).toContain("approved");
    });

    it("formats ProviderHealth", () => {
      const update: ProviderHealth = {
        type: "health",
        providers: [
          { name: "gcp", connected: true, lastChecked: "2026-03-31T00:00:00Z" },
          { name: "aws", connected: false, lastChecked: "2026-03-31T00:00:00Z" },
          { name: "cf", connected: true, lastChecked: "2026-03-31T00:00:00Z" },
        ],
      };
      const line = formatter.formatStatusLine(update);
      const plain = strip(line);
      expect(plain).toContain("gcp \u25CF");
      expect(plain).toContain("aws \u25CB");
      expect(plain).toContain("cf \u25CF");
    });

    it("colorizes resource changes with semantic colors", () => {
      const update: ResourceChangeSummary = {
        type: "resource:summary",
        provider: "gcp",
        created: 2,
        updated: 1,
        deleted: 3,
        failed: 0,
        resources: [],
      };
      const raw = formatter.formatStatusLine(update);
      expect(raw).toContain("\x1b[");
      expect(strip(raw)).toContain("+2");
    });
  });

  describe("formatDetailView", () => {
    it("renders a box with multiple status lines", () => {
      const updates: StatusUpdate[] = [
        {
          type: "plan:progress",
          planId: "p1",
          currentAction: 3,
          totalActions: 7,
          completedActions: 3,
          failedActions: 0,
          rolledBackActions: 0,
          phase: "executing",
        },
        {
          type: "gate:status",
          planId: "p1",
          riskLevel: "high",
          waitingForReview: true,
        },
        {
          type: "auth:status",
          provider: "gcp",
          authenticated: true,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          type: "resource:summary",
          provider: "gcp",
          created: 2,
          updated: 1,
          deleted: 0,
          failed: 0,
          resources: [],
        },
        {
          type: "cost:estimate",
          provider: "gcp",
          estimatedMonthlyCost: "$12.50",
          currency: "USD",
        },
      ];

      const view = formatter.formatDetailView(updates);
      const plain = strip(view);

      expect(plain).toContain("\u250C");
      expect(plain).toContain("\u2510");
      expect(plain).toContain("\u2514");
      expect(plain).toContain("\u2518");
      expect(plain).toContain("Terror Status");
      expect(plain).toContain("Plan:");
      expect(plain).toContain("Risk: HIGH");
      expect(plain).toContain("GCP:");
      expect(plain).toContain("Changes:");
      expect(plain).toContain("Est. cost:");
    });

    it("returns empty string for no updates", () => {
      expect(formatter.formatDetailView([])).toBe("");
    });

    it("combines multiple updates correctly", () => {
      const updates: StatusUpdate[] = [
        {
          type: "health",
          providers: [
            { name: "gcp", connected: true, lastChecked: "2026-03-31T00:00:00Z" },
            { name: "aws", connected: false, lastChecked: "2026-03-31T00:00:00Z" },
          ],
        },
      ];

      const view = formatter.formatDetailView(updates);
      const plain = strip(view);
      expect(plain).toContain("Providers: gcp: \u25CF, aws: \u25CB");
    });

    it("renders consistent box characters", () => {
      const updates: StatusUpdate[] = [
        {
          type: "cost:estimate",
          provider: "gcp",
          estimatedMonthlyCost: "$5.00",
          currency: "USD",
        },
      ];

      const view = formatter.formatDetailView(updates);
      const lines = strip(view).split("\n");

      expect(lines[0]).toMatch(/^\u250C/);
      expect(lines[0]).toMatch(/\u2510$/);
      expect(lines[lines.length - 1]).toMatch(/^\u2514/);
      expect(lines[lines.length - 1]).toMatch(/\u2518$/);

      for (let i = 1; i < lines.length - 1; i++) {
        expect(lines[i]).toMatch(/^\u2502/);
        expect(lines[i]).toMatch(/\u2502$/);
      }
    });

    it("handles resource summary with no changes", () => {
      const updates: StatusUpdate[] = [
        {
          type: "resource:summary",
          provider: "gcp",
          created: 0,
          updated: 0,
          deleted: 0,
          failed: 0,
          resources: [],
        },
      ];

      const view = formatter.formatDetailView(updates);
      expect(strip(view)).toContain("Changes: none");
    });

    it("handles resource summary with failures", () => {
      const updates: StatusUpdate[] = [
        {
          type: "resource:summary",
          provider: "gcp",
          created: 1,
          updated: 0,
          deleted: 0,
          failed: 2,
          resources: [],
        },
      ];

      const view = formatter.formatDetailView(updates);
      const plain = strip(view);
      expect(plain).toContain("+1 created");
      expect(plain).toContain("2 failed");
    });

    it("includes ANSI color codes for purple theme", () => {
      const updates: StatusUpdate[] = [
        {
          type: "cost:estimate",
          provider: "gcp",
          estimatedMonthlyCost: "$5.00",
          currency: "USD",
        },
      ];

      const view = formatter.formatDetailView(updates);
      expect(view).toContain("\x1b[");
      expect(view).toContain("Terror Status");
    });
  });
});
