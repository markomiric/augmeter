/**
 * ABOUTME: Shared provider usage and health contracts for multi-provider aggregation.
 */

/**
 * Canonical provider IDs used across the extension.
 * Additional custom provider IDs are allowed.
 */
export type KnownProviderId = "augment" | "claude" | "codex" | "copilot";
export type ProviderId = KnownProviderId | string;

/**
 * Normalized reporting windows supported by provider adapters.
 */
export type UsageWindowType = "rolling_5h" | "weekly_7d" | "daily" | "monthly" | "custom";

/**
 * Metric categories emitted by adapters.
 */
export type UsageMetricType =
  | "messages"
  | "tokens"
  | "credits"
  | "cost_usd"
  | "sessions"
  | "custom";

/**
 * Where the data came from.
 */
export type ProviderSourceKind = "api" | "cli" | "file" | "derived" | "manual" | "unknown";

/**
 * Operational health for an adapter.
 */
export type ProviderHealthStatus =
  | "connected"
  | "degraded"
  | "unavailable"
  | "restricted"
  | "disabled";

/**
 * A normalized provider usage record.
 */
export interface ProviderUsageSnapshot {
  providerId: ProviderId;
  timestamp: string; // ISO 8601 collection time
  windowType: UsageWindowType;
  metricType: UsageMetricType;
  sourceKind: ProviderSourceKind;
  source?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  percentUsed?: number;
  resetAt?: string; // ISO 8601
  freshnessAt?: string; // ISO 8601 source freshness timestamp
  confidence?: number; // 0..1
  details?: Record<string, string | number | boolean | null>;
}

/**
 * Latest health sample for a provider.
 */
export interface ProviderHealthSnapshot {
  providerId: ProviderId;
  status: ProviderHealthStatus;
  checkedAt: string; // ISO 8601
  sourceKind?: ProviderSourceKind;
  message?: string;
  errorCode?: string;
  canCollectInCurrentWorkspace: boolean;
}
