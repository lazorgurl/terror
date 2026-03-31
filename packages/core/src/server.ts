import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { AgentDecisionResponse, Provider, Resource, TerrorConfig, Tool } from "./types.js";
import { PlanEngine } from "./plan-engine.js";
import { Logger } from "./logger.js";
import { ResponseOptimizer } from "./response-optimizer.js";
import { StatusEmitter } from "./status-emitter.js";
import { TuiFormatter } from "./tui-formatter.js";

export class TerrorServer {
  private server: McpServer;
  private logger: Logger;
  private config: TerrorConfig;
  private planEngine: PlanEngine;
  private optimizer: ResponseOptimizer;
  private statusEmitter: StatusEmitter;
  private tuiFormatter: TuiFormatter;

  constructor(config: TerrorConfig, planEngine?: PlanEngine) {
    this.config = config;
    this.logger = new Logger(config.logLevel);
    this.server = new McpServer({
      name: "terror",
      version: "0.1.0",
    });
    this.statusEmitter = new StatusEmitter(this.server);
    this.tuiFormatter = new TuiFormatter();
    this.optimizer = new ResponseOptimizer();
    this.planEngine = planEngine ?? new PlanEngine(config.providers, this.logger, {
      autoApply: config.autoApply,
      statusEmitter: this.statusEmitter,
    });

    for (const provider of config.providers) {
      this.registerProvider(provider);
    }

    this.registerDecisionGateTools();
    this.registerStatusTools();
  }

  getPlanEngine(): PlanEngine {
    return this.planEngine;
  }

  registerProvider(provider: Provider) {
    this.logger.info("Registering provider", { provider: provider.name });

    const tools = provider.getTools();
    const compositeTools = provider.getCompositeTools();

    for (const tool of [...tools, ...compositeTools]) {
      this.registerTool(tool);
    }

    this.logger.info("Provider registered", {
      provider: provider.name,
      toolCount: tools.length,
      compositeToolCount: compositeTools.length,
    });
  }

  private isListTool(name: string): boolean {
    return name.endsWith("_list");
  }

  private addMetaParams(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    return {
      ...schema,
      properties: {
        ...properties,
        _fields: {
          type: "string",
          description:
            "Comma-separated list of fields to return (e.g. 'id,name,status'). Reduces response size.",
        },
        _page: {
          type: "string",
          description: "Pagination cursor from a previous response's nextCursor.",
        },
        _pageSize: {
          type: "number",
          description: "Number of items per page (default 50).",
        },
        _delta: {
          type: "boolean",
          description:
            "If true, return only changes since the last query for this resource type.",
        },
      },
    };
  }

  private registerTool(tool: Tool) {
    const isList = this.isListTool(tool.name);
    const schema = isList
      ? this.addMetaParams(tool.inputSchema)
      : tool.inputSchema;

    this.server.tool(
      tool.name,
      tool.description,
      schema as Record<string, { type: string; description?: string }>,
      async (params) => {
        this.logger.debug("Tool invoked", { tool: tool.name });
        try {
          const rawParams = params as unknown as Record<string, unknown>;
          const _fields = rawParams._fields as string | undefined;
          const _page = rawParams._page as string | undefined;
          const _pageSize = (rawParams._pageSize as number | undefined) ?? 50;
          const _delta = rawParams._delta as boolean | undefined;

          delete rawParams._fields;
          delete rawParams._page;
          delete rawParams._pageSize;
          delete rawParams._delta;

          const result = await tool.handler(rawParams);

          if (isList && Array.isArray(result)) {
            return this.handleListResponse(
              tool.name,
              result as Resource[],
              { _fields, _page, _pageSize, _delta },
            );
          }

          return {
            content: [
              {
                type: "text" as const,
                text:
                  typeof result === "string"
                    ? result
                    : JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error("Tool execution failed", {
            tool: tool.name,
            error: message,
          });
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      }
    );

    this.logger.debug("Tool registered", { tool: tool.name });
  }

  private handleListResponse(
    toolName: string,
    resources: Resource[],
    meta: {
      _fields?: string;
      _page?: string;
      _pageSize: number;
      _delta?: boolean;
    },
  ) {
    const parts = toolName.split("_");
    const provider = parts[0] ?? "unknown";
    const resourceType = parts.slice(1, -1).join("_");

    if (meta._delta) {
      const delta = this.optimizer.getDeltaFromCache(
        provider,
        resourceType,
        resources,
      );
      if (delta) {
        const response = this.optimizer.formatResponse(delta, {
          resourceCount:
            delta.added.length + delta.modified.length + delta.removed.length,
          totalCount: resources.length,
          cached: true,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(response, null, 2) },
          ],
        };
      }
    }

    let processed: unknown[];
    if (meta._fields) {
      const fields = meta._fields.split(",").map((f) => f.trim());
      processed = resources.map((r) => this.optimizer.filterFields(r, fields));
    } else {
      processed = this.optimizer.summarizeList(resources);
    }

    const paginated = this.optimizer.paginate(
      processed,
      meta._pageSize,
      meta._page,
    );

    const response = this.optimizer.formatResponse(paginated.items, {
      resourceCount: paginated.items.length,
      totalCount: paginated.totalCount,
      truncated: paginated.nextCursor !== undefined,
      nextCursor: paginated.nextCursor,
    });

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(response, null, 2) },
      ],
    };
  }

  private registerDecisionGateTools() {
    this.server.tool(
      "terror_review_plan",
      "Get the decision review for a pending plan. Returns risk assessment, questions the agent must answer, and affected resources.",
      { planId: z.string().describe("The ID of the plan to review") },
      async (params) => {
        const review = this.planEngine.getReview(params.planId);
        if (!review) {
          return {
            content: [{ type: "text" as const, text: `Error: No pending review for plan ${params.planId}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(review, null, 2) }],
        };
      }
    );

    this.server.tool(
      "terror_submit_review",
      "Submit your decision response for a pending plan review. Provide your confidence level, justification, alternatives considered, and answers to the review questions.",
      {
        planId: z.string().describe("The ID of the plan being reviewed"),
        confidence: z.number().min(0).max(1).describe("Confidence level from 0 to 1"),
        justification: z.string().describe("Why you believe this plan should proceed"),
        alternativesConsidered: z.array(z.string()).describe("Alternative approaches you evaluated"),
        answers: z.record(z.string(), z.string()).describe("Answers to the review questions, keyed by question text"),
      },
      async (params) => {
        try {
          const response: AgentDecisionResponse = {
            planId: params.planId,
            confidence: params.confidence,
            justification: params.justification,
            alternativesConsidered: params.alternativesConsidered,
            answers: params.answers,
          };
          this.planEngine.submitReviewResponse(params.planId, response);
          return {
            content: [{ type: "text" as const, text: "Review response submitted. Awaiting verdict." }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      }
    );
  }

  getStatusEmitter(): StatusEmitter {
    return this.statusEmitter;
  }

  private registerStatusTools() {
    this.server.tool(
      "terror_status",
      "Get the current Terror status summary across all tracked dimensions (plan progress, auth, resources, cost, gates, health).",
      {},
      async () => {
        const statuses = this.statusEmitter.getAllStatuses();
        if (statuses.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No status updates available." }],
          };
        }
        const detail = this.tuiFormatter.formatDetailView(statuses);
        const json = JSON.stringify(statuses, null, 2);
        return {
          content: [
            { type: "text" as const, text: detail + "\n\n" + json },
          ],
        };
      }
    );

    this.server.tool(
      "terror_health",
      "Check connectivity and latency for all registered providers.",
      {},
      async () => {
        const health = await this.statusEmitter.healthCheck(this.config.providers);
        const line = this.tuiFormatter.formatStatusLine(health);
        const json = JSON.stringify(health, null, 2);
        return {
          content: [
            { type: "text" as const, text: line + "\n\n" + json },
          ],
        };
      }
    );
  }

  async start() {
    this.logger.info("Starting Terror MCP server");
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info("Terror MCP server connected via stdio");
  }
}
