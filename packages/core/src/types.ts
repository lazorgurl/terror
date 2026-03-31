export interface Provider {
  name: string;
  authenticate(): Promise<void>;
  listResources(): Promise<Resource[]>;
  getTools(): Tool[];
  getCompositeTools(): Tool[];
}

export interface Resource {
  id: string;
  type: string;
  provider: string;
  name: string;
  status: "active" | "pending" | "deleting" | "error" | "unknown";
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export type ActionType = "create" | "read" | "update" | "delete";

export interface Action {
  id: string;
  type: ActionType;
  resourceType: string;
  provider: string;
  params: Record<string, unknown>;
  description: string;
}

export type PlanStatus =
  | "pending"
  | "executing"
  | "completed"
  | "failed"
  | "rolled-back"
  | "rejected";

export interface Plan {
  id: string;
  actions: Action[];
  status: PlanStatus;
  results: ActionResult[];
}

export type ActionResultStatus =
  | "success"
  | "failed"
  | "skipped"
  | "rolled-back";

export interface ActionResult {
  actionId: string;
  status: ActionResultStatus;
  resource?: Resource;
  error?: string;
  rollbackAction?: Action;
}

export interface TerrorConfig {
  providers: Provider[];
  autoApply: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type Reversibility = "fully" | "partially" | "irreversible";

export type DecisionVerdictOutcome = "approved" | "rejected" | "escalate";

export interface RiskConfig {
  actionWeights: Record<ActionType, number>;
  resourceWeights: Record<string, number>;
  multipleResourcesMultiplier: number;
  mixedResourceTypesMultiplier: number;
  thresholds: { low: number; medium: number; high: number };
}

export interface DecisionReview {
  planId: string;
  riskAssessment: RiskLevel;
  riskScore: number;
  questions: string[];
  affectedResources: string[];
  reversibility: Reversibility;
}

export interface AgentDecisionResponse {
  planId: string;
  confidence: number;
  justification: string;
  alternativesConsidered: string[];
  answers: Record<string, string>;
}

export interface DecisionVerdict {
  outcome: DecisionVerdictOutcome;
  reason: string;
}

export interface ResourceSummary {
  id: string;
  name: string;
  type: string;
  status: Resource["status"];
  summary: string;
}

export interface ResourceChange {
  id: string;
  name: string;
  changedFields: Record<string, { from: unknown; to: unknown }>;
}

export interface ResourceDelta {
  added: Resource[];
  removed: ResourceSummary[];
  modified: ResourceChange[];
  unchanged: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  totalCount: number;
  pageSize: number;
}

export interface ResponseMetadata {
  resourceCount?: number;
  totalCount?: number;
  cached?: boolean;
  truncated?: boolean;
  nextCursor?: string;
}

export interface ToolResponse {
  data: unknown;
  tokenHint: string;
  metadata: ResponseMetadata;
}

export type PlanPhase =
  | "validating"
  | "executing"
  | "rolling-back"
  | "complete";

export interface PlanProgress {
  type: "plan:progress";
  planId: string;
  currentAction: number;
  totalActions: number;
  completedActions: number;
  failedActions: number;
  rolledBackActions: number;
  phase: PlanPhase;
}

export interface AuthStatusUpdate {
  type: "auth:status";
  provider: string;
  authenticated: boolean;
  expiresAt?: string;
  scopes?: string[];
}

export interface StatusResourceChange {
  type: string;
  name: string;
  action: ActionType;
  status: "success" | "failed" | "pending";
}

export interface ResourceChangeSummary {
  type: "resource:summary";
  provider: string;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  resources: StatusResourceChange[];
}

export interface CostBreakdownItem {
  resource: string;
  monthlyCost: string;
}

export interface CostEstimate {
  type: "cost:estimate";
  provider: string;
  estimatedMonthlyCost?: string;
  costBreakdown?: CostBreakdownItem[];
  currency: "USD";
}

export interface GateStatus {
  type: "gate:status";
  planId: string;
  riskLevel: RiskLevel;
  verdict?: string;
  waitingForReview: boolean;
}

export interface ProviderHealthEntry {
  name: string;
  connected: boolean;
  latencyMs?: number;
  lastChecked: string;
}

export interface ProviderHealth {
  type: "health";
  providers: ProviderHealthEntry[];
}

export type StatusUpdate =
  | PlanProgress
  | AuthStatusUpdate
  | ResourceChangeSummary
  | CostEstimate
  | GateStatus
  | ProviderHealth;
