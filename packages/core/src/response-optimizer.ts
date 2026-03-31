import type {
  Resource,
  ResourceSummary,
  ResourceDelta,
  ResourceChange,
  PaginatedResponse,
  ToolResponse,
  ResponseMetadata,
} from "./types.js";

interface CacheEntry {
  resources: Resource[];
  timestamp: number;
}

export class ResponseOptimizer {
  private cache = new Map<string, CacheEntry>();
  private cacheTtlMs: number;

  constructor(cacheTtlMs = 60_000) {
    this.cacheTtlMs = cacheTtlMs;
  }

  summarizeList(resources: Resource[]): ResourceSummary[] {
    return resources.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      summary: this.buildSummary(r),
    }));
  }

  filterFields(resource: Resource, fields?: string[]): Partial<Resource> {
    if (!fields || fields.length === 0) {
      const { id, name, type, status } = resource;
      return { id, name, type, status };
    }

    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in resource) {
        result[field] = resource[field as keyof Resource];
      }
    }
    return result as Partial<Resource>;
  }

  computeDelta(
    previous: Resource[],
    current: Resource[],
  ): ResourceDelta {
    const prevMap = new Map(previous.map((r) => [r.id, r]));
    const currMap = new Map(current.map((r) => [r.id, r]));

    const added: Resource[] = [];
    const removed: ResourceSummary[] = [];
    const modified: ResourceChange[] = [];
    let unchanged = 0;

    for (const [id, resource] of currMap) {
      const prev = prevMap.get(id);
      if (!prev) {
        added.push(resource);
      } else {
        const changedFields = this.diffResources(prev, resource);
        if (Object.keys(changedFields).length > 0) {
          modified.push({ id, name: resource.name, changedFields });
        } else {
          unchanged++;
        }
      }
    }

    for (const [id, resource] of prevMap) {
      if (!currMap.has(id)) {
        removed.push({
          id,
          name: resource.name,
          type: resource.type,
          status: resource.status,
          summary: this.buildSummary(resource),
        });
      }
    }

    return { added, removed, modified, unchanged };
  }

  getDeltaFromCache(
    provider: string,
    resourceType: string,
    current: Resource[],
  ): ResourceDelta | null {
    const key = this.cacheKey(provider, resourceType);
    const entry = this.cache.get(key);

    if (!entry) {
      this.cache.set(key, { resources: current, timestamp: Date.now() });
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.cacheTtlMs) {
      this.cache.set(key, { resources: current, timestamp: Date.now() });
      return null;
    }

    const delta = this.computeDelta(entry.resources, current);
    this.cache.set(key, { resources: current, timestamp: Date.now() });
    return delta;
  }

  paginate<T>(items: T[], pageSize: number, cursor?: string): PaginatedResponse<T> {
    const offset = cursor ? this.decodeCursor(cursor) : 0;
    const page = items.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < items.length;

    return {
      items: page,
      totalCount: items.length,
      pageSize,
      nextCursor: hasMore ? this.encodeCursor(offset + pageSize) : undefined,
    };
  }

  formatResponse(data: unknown, metadata?: ResponseMetadata): ToolResponse {
    const tokenHint = this.buildTokenHint(data, metadata);
    return {
      data,
      tokenHint,
      metadata: metadata ?? {},
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  private buildSummary(resource: Resource): string {
    const parts: string[] = [];
    const props = resource.properties;

    if (resource.type === "compute-instance") {
      if (props.machineType) {
        const mt = String(props.machineType);
        const shortType = mt.includes("/") ? mt.split("/").pop()! : mt;
        parts.push(shortType);
      }
      if (props.zone) {
        const zone = String(props.zone);
        const shortZone = zone.includes("/") ? zone.split("/").pop()! : zone;
        parts.push(shortZone);
      }
      parts.push(resource.status.toUpperCase());
    } else if (resource.type === "storage-bucket") {
      if (props.location) parts.push(String(props.location));
      if (props.storageClass) parts.push(String(props.storageClass));
      parts.push(resource.status.toUpperCase());
    } else {
      const candidates = ["region", "location", "zone", "state"];
      for (const key of candidates) {
        if (props[key]) {
          parts.push(String(props[key]));
          break;
        }
      }
      parts.push(resource.status.toUpperCase());
    }

    return parts.join(", ");
  }

  private diffResources(
    prev: Resource,
    curr: Resource,
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    const scalarKeys: (keyof Resource)[] = ["name", "status", "type", "provider"];
    for (const key of scalarKeys) {
      if (prev[key] !== curr[key]) {
        changes[key] = { from: prev[key], to: curr[key] };
      }
    }

    const dateKeys: (keyof Resource)[] = ["createdAt", "updatedAt"];
    for (const key of dateKeys) {
      const prevDate = prev[key] as Date;
      const currDate = curr[key] as Date;
      if (prevDate.getTime() !== currDate.getTime()) {
        changes[key] = { from: prevDate.toISOString(), to: currDate.toISOString() };
      }
    }

    const allPropKeys = new Set([
      ...Object.keys(prev.properties),
      ...Object.keys(curr.properties),
    ]);
    for (const key of allPropKeys) {
      const prevVal = prev.properties[key];
      const currVal = curr.properties[key];
      if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
        changes[`properties.${key}`] = { from: prevVal, to: currVal };
      }
    }

    return changes;
  }

  private cacheKey(provider: string, resourceType: string): string {
    return `${provider}:${resourceType}`;
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(String(offset), "utf-8").toString("base64");
  }

  private decodeCursor(cursor: string): number {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const offset = parseInt(decoded, 10);
    if (isNaN(offset) || offset < 0) return 0;
    return offset;
  }

  private buildTokenHint(data: unknown, metadata?: ResponseMetadata): string {
    const parts: string[] = [];

    if (metadata?.resourceCount !== undefined) {
      const total = metadata.totalCount ?? metadata.resourceCount;
      if (total > metadata.resourceCount) {
        parts.push(
          `Showing ${metadata.resourceCount} of ${total} resources.`,
        );
      } else {
        parts.push(`${metadata.resourceCount} resources.`);
      }
    }

    if (metadata?.cached) {
      parts.push("Delta response — only changes since last query.");
    }

    if (metadata?.truncated) {
      parts.push("Results truncated.");
    }

    if (metadata?.nextCursor) {
      parts.push("More results available — pass _page cursor to continue.");
    }

    if (Array.isArray(data) && data.length > 0 && "summary" in data[0]) {
      parts.push("Use the resource-specific get tool for full details.");
    }

    if (parts.length === 0) {
      return "Complete response.";
    }

    return parts.join(" ");
  }
}
