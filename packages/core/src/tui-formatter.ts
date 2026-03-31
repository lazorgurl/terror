import type {
  AuthStatusUpdate,
  CostEstimate,
  GateStatus,
  PlanProgress,
  ProviderHealth,
  ResourceChangeSummary,
  StatusUpdate,
} from "./types.js";
import {
  AMBER,
  BLOOD_RED,
  BOLD,
  GHOST_WHITE,
  PURPLE,
  PURPLE_BRIGHT,
  PURPLE_DIM,
  RESET,
  SPECTRAL_GREEN,
  colorize,
  strip,
} from "./theme.js";

const FILLED_BLOCK = "\u2588";
const EMPTY_BLOCK = "\u2591";

export class TuiFormatter {
  formatProgressBar(current: number, total: number, width = 7): number[] & { toString(): string } {
    if (total <= 0) {
      const bar = colorize(EMPTY_BLOCK.repeat(width), PURPLE_DIM);
      return Object.assign([] as number[], { toString: () => bar });
    }

    const ratio = Math.max(0, Math.min(1, current / total));
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const bar =
      colorize(FILLED_BLOCK.repeat(filled), PURPLE) +
      colorize(EMPTY_BLOCK.repeat(empty), PURPLE_DIM);
    return Object.assign([] as number[], { toString: () => bar });
  }

  formatStatusLine(update: StatusUpdate): string {
    switch (update.type) {
      case "plan:progress":
        return this.formatPlanProgress(update);
      case "auth:status":
        return this.formatAuthStatus(update);
      case "resource:summary":
        return this.formatResourceSummary(update);
      case "cost:estimate":
        return this.formatCostEstimate(update);
      case "gate:status":
        return this.formatGateStatus(update);
      case "health":
        return this.formatProviderHealth(update);
    }
  }

  formatDetailView(updates: StatusUpdate[]): string {
    const lines: string[] = [];

    for (const update of updates) {
      switch (update.type) {
        case "plan:progress": {
          const bar = this.formatProgressBar(
            update.completedActions,
            update.totalActions
          );
          lines.push(
            `${colorize("Plan:", GHOST_WHITE)} ${update.completedActions}/${update.totalActions} actions [${bar}]`
          );
          break;
        }
        case "gate:status": {
          const riskLabel = this.colorizeRisk(update.riskLevel.toUpperCase(), update.riskLevel);
          const reviewLabel = update.waitingForReview
            ? "Awaiting review"
            : update.verdict ?? "Cleared";
          lines.push(`${colorize("Risk:", GHOST_WHITE)} ${riskLabel} \u2022 ${reviewLabel}`);
          break;
        }
        case "auth:status": {
          const symbol = update.authenticated
            ? colorize("\u25CF", SPECTRAL_GREEN)
            : colorize("\u25CB", PURPLE_DIM);
          let detail = update.authenticated ? "authenticated" : "not authenticated";
          if (update.authenticated && update.expiresAt) {
            detail += ` (${formatRelativeTime(update.expiresAt)} left)`;
          }
          lines.push(`${colorize(update.provider.toUpperCase() + ":", GHOST_WHITE)} ${symbol} ${detail}`);
          break;
        }
        case "resource:summary": {
          const parts: string[] = [];
          if (update.created > 0) parts.push(`${colorize("+" + update.created, SPECTRAL_GREEN)} created`);
          if (update.updated > 0) parts.push(`${colorize("~" + update.updated, AMBER)} updated`);
          if (update.deleted > 0) parts.push(`${colorize("-" + update.deleted, BLOOD_RED)} deleted`);
          if (update.failed > 0) parts.push(`${colorize(String(update.failed), BLOOD_RED)} failed`);
          lines.push(`${colorize("Changes:", GHOST_WHITE)} ${parts.join(", ") || "none"}`);
          break;
        }
        case "cost:estimate": {
          lines.push(
            `${colorize("Est. cost:", GHOST_WHITE)} ${colorize("~" + (update.estimatedMonthlyCost ?? "$0.00") + "/mo", PURPLE)}`
          );
          break;
        }
        case "health": {
          const providerParts = update.providers.map(
            (p) =>
              `${p.name}: ${p.connected ? colorize("\u25CF", SPECTRAL_GREEN) : colorize("\u25CB", PURPLE_DIM)}`
          );
          lines.push(`${colorize("Providers:", GHOST_WHITE)} ${providerParts.join(", ")}`);
          break;
        }
      }
    }

    if (lines.length === 0) return "";

    const contentWidth = Math.max(...lines.map((l) => strip(l).length), 20);
    const boxWidth = contentWidth + 4;
    const title = " Terror Status ";
    const topBorderLen = boxWidth - 2 - title.length;
    const topLeft = Math.max(0, topBorderLen);

    const coloredTitle = ` ${BOLD}${PURPLE_BRIGHT}Terror Status${RESET}${PURPLE_DIM} `;

    const top =
      colorize("\u250C\u2500", PURPLE_DIM) +
      coloredTitle +
      colorize("\u2500".repeat(topLeft), PURPLE_DIM) +
      colorize("\u2510", PURPLE_DIM);
    const bottom =
      colorize("\u2514" + "\u2500".repeat(boxWidth - 2) + "\u2518", PURPLE_DIM);

    const paddedLines = lines.map((line) => {
      const visible = strip(line).length;
      const padding = contentWidth - visible;
      return colorize("\u2502", PURPLE_DIM) + " " + line + " ".repeat(padding) + " " + colorize("\u2502", PURPLE_DIM);
    });

    return [top, ...paddedLines, bottom].join("\n");
  }

  private colorizeRisk(label: string, level: string): string {
    switch (level) {
      case "low":
        return colorize(label, SPECTRAL_GREEN);
      case "medium":
        return colorize(label, AMBER);
      case "high":
        return colorize(label, BLOOD_RED);
      case "critical":
        return `${BOLD}${BLOOD_RED}${label}${RESET}`;
      default:
        return label;
    }
  }

  private formatPlanProgress(update: PlanProgress): string {
    const bar = this.formatProgressBar(
      update.completedActions,
      update.totalActions
    );
    const failedLabel =
      update.failedActions > 0
        ? colorize(`${update.failedActions} failed`, BLOOD_RED)
        : "0 failed";
    return `\u25B6 Plan ${update.completedActions}/${update.totalActions} [${bar}] ${update.phase} \u2022 ${failedLabel}`;
  }

  private formatAuthStatus(update: AuthStatusUpdate): string {
    if (!update.authenticated) {
      return `\uD83D\uDD11 ${update.provider}: not authenticated`;
    }
    let line = `\uD83D\uDD11 ${update.provider}: authenticated`;
    if (update.expiresAt) {
      line += ` (expires ${formatRelativeTime(update.expiresAt)})`;
    }
    return line;
  }

  private formatResourceSummary(update: ResourceChangeSummary): string {
    return `\u0394 ${colorize("+" + update.created, SPECTRAL_GREEN)} ${colorize("~" + update.updated, AMBER)} ${colorize("-" + update.deleted, BLOOD_RED)} resources`;
  }

  private formatCostEstimate(update: CostEstimate): string {
    return `\uD83D\uDCB0 ${colorize("~" + (update.estimatedMonthlyCost ?? "$0.00") + "/mo", PURPLE)} estimated`;
  }

  private formatGateStatus(update: GateStatus): string {
    const riskLabel = this.colorizeRisk(update.riskLevel.toUpperCase(), update.riskLevel);
    if (update.waitingForReview) {
      return `\u26A0 ${riskLabel} risk \u2022 awaiting review`;
    }
    return `\u26A0 ${riskLabel} risk \u2022 ${update.verdict ?? "cleared"}`;
  }

  private formatProviderHealth(update: ProviderHealth): string {
    return update.providers
      .map((p) => `${p.name} ${p.connected ? colorize("\u25CF", SPECTRAL_GREEN) : colorize("\u25CB", PURPLE_DIM)}`)
      .join(" ");
  }
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const target = new Date(isoDate).getTime();
  const diffMs = target - now;

  if (diffMs <= 0) return "expired";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}
