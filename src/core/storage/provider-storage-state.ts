import {
  type ProviderHealthSnapshot,
  type ProviderHealthStatus,
  type ProviderId,
  type ProviderSourceKind,
  type ProviderUsageSnapshot,
  type UsageMetricType,
  type UsageWindowType,
} from "../types/provider-usage";

export interface ProviderAlertState {
  cycleId: string;
  lastThreshold: number;
  runOutAlerted: boolean;
}

export function getDefaultProviderAlertState(): ProviderAlertState {
  return {
    cycleId: "",
    lastThreshold: 0,
    runOutAlerted: false,
  };
}

export function normalizeProviderId(providerId: ProviderId): string {
  if (typeof providerId !== "string") {
    return "";
  }
  return providerId.trim().toLowerCase();
}

export function parseProviderHealthMap(stored: unknown): Record<string, ProviderHealthSnapshot> {
  if (!isRecord(stored)) {
    return {};
  }

  const map: Record<string, ProviderHealthSnapshot> = {};
  for (const [providerId, value] of Object.entries(stored)) {
    const normalized = normalizeProviderHealthSnapshot(
      isRecord(value) ? { providerId, ...value } : value
    );
    if (normalized) {
      map[providerId] = normalized;
    }
  }
  return map;
}

export function parseProviderAlertStateMap(stored: unknown): Record<string, ProviderAlertState> {
  if (!isRecord(stored)) {
    return {};
  }

  const map: Record<string, ProviderAlertState> = {};
  for (const [providerId, value] of Object.entries(stored)) {
    if (!isRecord(value)) {
      continue;
    }

    const cycleId = typeof value.cycleId === "string" ? value.cycleId : "";
    const lastThreshold =
      typeof value.lastThreshold === "number" && Number.isFinite(value.lastThreshold)
        ? value.lastThreshold
        : 0;

    map[providerId] = {
      cycleId,
      lastThreshold,
      runOutAlerted: value.runOutAlerted === true,
    };
  }

  return map;
}

export function normalizeProviderUsageSnapshot(raw: unknown): ProviderUsageSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const providerId = typeof raw.providerId === "string" ? raw.providerId : null;
  const timestamp = typeof raw.timestamp === "string" ? raw.timestamp : null;
  const windowType = parseUsageWindowType(raw.windowType);
  const metricType = parseUsageMetricType(raw.metricType);
  const sourceKind = parseProviderSourceKind(raw.sourceKind);

  if (!providerId || !timestamp || !windowType || !metricType || !sourceKind) {
    return null;
  }

  const snapshot: ProviderUsageSnapshot = {
    providerId,
    timestamp,
    windowType,
    metricType,
    sourceKind,
  };

  if (typeof raw.source === "string" && raw.source.length > 0) {
    snapshot.source = raw.source;
  }
  if (typeof raw.used === "number" && Number.isFinite(raw.used)) {
    snapshot.used = raw.used;
  }
  if (typeof raw.limit === "number" && Number.isFinite(raw.limit)) {
    snapshot.limit = raw.limit;
  }
  if (typeof raw.remaining === "number" && Number.isFinite(raw.remaining)) {
    snapshot.remaining = raw.remaining;
  }
  if (typeof raw.percentUsed === "number" && Number.isFinite(raw.percentUsed)) {
    snapshot.percentUsed = raw.percentUsed;
  }
  if (typeof raw.resetAt === "string" && raw.resetAt.length > 0) {
    snapshot.resetAt = raw.resetAt;
  }
  if (typeof raw.freshnessAt === "string" && raw.freshnessAt.length > 0) {
    snapshot.freshnessAt = raw.freshnessAt;
  }
  if (typeof raw.confidence === "number" && Number.isFinite(raw.confidence)) {
    snapshot.confidence = Math.max(0, Math.min(1, raw.confidence));
  }
  if (isRecord(raw.details)) {
    const details: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(raw.details)) {
      if (typeof value === "string" || typeof value === "boolean" || value === null) {
        details[key] = value;
      } else if (typeof value === "number" && Number.isFinite(value)) {
        details[key] = value;
      }
    }
    if (Object.keys(details).length > 0) {
      snapshot.details = details;
    }
  }

  return snapshot;
}

export function normalizeProviderHealthSnapshot(raw: unknown): ProviderHealthSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const providerId = typeof raw.providerId === "string" ? raw.providerId : null;
  const status = parseProviderHealthStatus(raw.status);
  const checkedAt =
    typeof raw.checkedAt === "string" && raw.checkedAt.length > 0
      ? raw.checkedAt
      : new Date().toISOString();
  const canCollectInCurrentWorkspace =
    typeof raw.canCollectInCurrentWorkspace === "boolean" ? raw.canCollectInCurrentWorkspace : true;

  if (!providerId || !status) {
    return null;
  }

  const health: ProviderHealthSnapshot = {
    providerId,
    status,
    checkedAt,
    canCollectInCurrentWorkspace,
  };

  const sourceKind = parseProviderSourceKind(raw.sourceKind);
  if (sourceKind) {
    health.sourceKind = sourceKind;
  }
  if (typeof raw.message === "string" && raw.message.length > 0) {
    health.message = raw.message;
  }
  if (typeof raw.errorCode === "string" && raw.errorCode.length > 0) {
    health.errorCode = raw.errorCode;
  }

  return health;
}

function parseUsageWindowType(value: unknown): UsageWindowType | null {
  if (typeof value !== "string") {
    return null;
  }
  if (
    value === "rolling_5h" ||
    value === "weekly_7d" ||
    value === "daily" ||
    value === "monthly" ||
    value === "custom"
  ) {
    return value;
  }
  return null;
}

function parseUsageMetricType(value: unknown): UsageMetricType | null {
  if (typeof value !== "string") {
    return null;
  }
  if (
    value === "messages" ||
    value === "tokens" ||
    value === "credits" ||
    value === "cost_usd" ||
    value === "sessions" ||
    value === "custom"
  ) {
    return value;
  }
  return null;
}

function parseProviderSourceKind(value: unknown): ProviderSourceKind | null {
  if (typeof value !== "string") {
    return null;
  }
  if (
    value === "api" ||
    value === "cli" ||
    value === "file" ||
    value === "derived" ||
    value === "manual" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function parseProviderHealthStatus(value: unknown): ProviderHealthStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  if (
    value === "connected" ||
    value === "degraded" ||
    value === "unavailable" ||
    value === "restricted" ||
    value === "disabled"
  ) {
    return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
