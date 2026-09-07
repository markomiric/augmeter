import type { CopilotApiConfig } from "../core/config/config-manager";
import type { UsageSnapshot } from "../core/storage/storage-manager";
import type { ProviderHealthSnapshot, ProviderUsageSnapshot } from "../core/types/provider-usage";

export interface UsageSummaryTextInput {
  usage: number;
  limit: number;
  usageKnown?: boolean | undefined;
  remainingCredits?: number | undefined;
  monthlyAllowance?: number | null | undefined;
  subscriptionType?: string | undefined;
  renewalDate?: string | undefined;
  cycleTarget: number;
  targetDelta: number | null;
  projectedDays: number | null;
  projectedDate: Date | null;
  now: Date;
}

export interface UsageBundleInput {
  generatedAt: Date;
  extensionVersion: string;
  currentUsage: number;
  currentLimit: number;
  remainingCredits: number;
  usageKnown?: boolean | undefined;
  monthlyAllowance?: number | null | undefined;
  renewalDate?: string | undefined;
  subscriptionType?: string | undefined;
  usageSnapshots: UsageSnapshot[];
  providerSnapshots: ProviderUsageSnapshot[];
  providerHealth: ProviderHealthSnapshot[];
  retentionDays: number;
  alertThresholds: { warning: number; high: number; critical: number };
  runOutDays: number;
  cycleTarget: number;
  enabledProviders: readonly string[];
  copilotApiConfig: CopilotApiConfig;
  copilotTokenPresent: boolean;
}

export interface DiagnosticsInput {
  generatedAt: Date;
  extensionId?: string | undefined;
  extensionVersion?: string | undefined;
  vscodeVersion: string;
  nodeVersion: string;
  platform: string;
  workspaceTrusted: boolean;
  hasCookie: boolean;
  hasRealData: boolean;
  dataSource: string;
  dataSourceMode?: string | undefined;
  cliDetected?: boolean | undefined;
  cliAuthenticated?: boolean | undefined;
  usage: {
    used: number;
    limit: number;
    remaining: number;
    subscriptionType?: string | undefined;
    renewalDate?: string | undefined;
    lastFetchedAt?: Date | undefined;
  };
  config: {
    refreshInterval: number;
    clickAction: string;
    showInStatusBar: boolean;
    alertThresholds: { warning: number; high: number; critical: number };
    runOutDays: number;
    cycleTarget: number;
    retentionDays: number;
    providerTrackingEnabled: boolean;
    enabledProviders: readonly string[];
    claudeProjectsPath: string;
    codexSessionsPath: string;
    copilotStateDbPath: string;
    copilotApi: CopilotApiConfig & { tokenPresent: boolean };
    logLevel: string;
  };
  providerHealth: ProviderHealthSnapshot[];
  providerSnapshots: ProviderUsageSnapshot[];
  supportIssueUrl: string;
}

export function buildUsageSummaryText(input: UsageSummaryTextInput): string {
  const {
    usage,
    limit,
    usageKnown = true,
    monthlyAllowance,
    subscriptionType,
    renewalDate,
    cycleTarget,
    targetDelta,
    projectedDays,
  } = input;
  const percentage = limit > 0 ? Math.round((usage / limit) * 100) : 0;
  const remaining = input.remainingCredits ?? (limit > 0 ? Math.max(limit - usage, 0) : undefined);
  const lines: string[] = ["Augment credit summary"];

  if (subscriptionType) {
    lines.push(`Plan: ${subscriptionType}`);
  }

  if (usageKnown) {
    if (limit > 0) {
      lines.push(
        `Used: ${usage.toLocaleString()} of ${limit.toLocaleString()} credits (${percentage}%)`
      );
      lines.push(`Remaining: ${remaining?.toLocaleString() ?? "0"} credits`);
    } else {
      lines.push(`Used: ${usage.toLocaleString()} credits`);
      lines.push("Cycle limit: unavailable");
    }
  } else {
    if (remaining !== undefined) {
      lines.push(`Remaining: ${remaining.toLocaleString()} credits`);
    }
    if (monthlyAllowance !== null && monthlyAllowance !== undefined) {
      lines.push(`Monthly allowance: ${monthlyAllowance.toLocaleString()} credits`);
    }
    lines.push("Cycle usage: Auggie reports the balance only");
  }

  if (usageKnown && cycleTarget > 0 && targetDelta !== null) {
    lines.push(
      `Cycle target: ${cycleTarget.toLocaleString()} credits (${targetDelta >= 0 ? `${Math.abs(targetDelta).toLocaleString()} under` : `${Math.abs(targetDelta).toLocaleString()} over`})`
    );
  }

  if (usageKnown && projectedDays !== null) {
    if (projectedDays <= 0) {
      lines.push("At this pace: credits exhausted");
    } else if (projectedDays < 1) {
      const hours = Math.max(1, Math.round(projectedDays * 24));
      lines.push(`At this pace: about ${hours} ${hours === 1 ? "hour" : "hours"} left`);
    } else {
      const days = Math.max(1, Math.round(projectedDays));
      lines.push(`At this pace: about ${days} ${days === 1 ? "day" : "days"} left`);
    }
  }

  if (usageKnown && input.projectedDate) {
    lines.push(`Estimated run-out date: ${input.projectedDate.toLocaleDateString()}`);
  }

  if (renewalDate) {
    const renewalLine = formatRenewalLine(renewalDate);
    if (renewalLine) {
      lines.push(renewalLine);
    }
  }

  lines.push(`As of: ${input.now.toLocaleString()}`);
  return lines.join("\n");
}

export function buildUsageHistoryCsv(snapshots: UsageSnapshot[]): string {
  const lines = ["timestamp,consumed,limit,remaining,source"];
  for (const snapshot of snapshots) {
    const limit = snapshot.limit ?? 0;
    const remaining = limit > 0 ? Math.max(limit - snapshot.consumed, 0) : 0;
    lines.push(
      [
        escapeCsv(snapshot.timestamp),
        snapshot.consumed.toString(),
        limit > 0 ? limit.toString() : "",
        limit > 0 ? remaining.toString() : "",
        escapeCsv(snapshot.source || ""),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function buildUsageBundle(input: UsageBundleInput): {
  generatedAt: string;
  extensionVersion: string;
  usage: {
    current: {
      used: number;
      limit: number;
      remaining: number;
      usageKnown: boolean;
      monthlyAllowance?: number | null | undefined;
      renewalDate?: string | undefined;
      subscriptionType?: string | undefined;
    };
    snapshots: UsageSnapshot[];
  };
  providers: {
    snapshots: ProviderUsageSnapshot[];
    health: ProviderHealthSnapshot[];
  };
  config: {
    retentionDays: number;
    alertThresholds: { warning: number; high: number; critical: number };
    runOutDays: number;
    cycleTarget: number;
    enabledProviders: readonly string[];
    copilotApi: {
      enabled: boolean;
      username: string;
      tokenPresent: boolean;
    };
  };
} {
  return {
    generatedAt: input.generatedAt.toISOString(),
    extensionVersion: input.extensionVersion,
    usage: {
      current: {
        used: input.currentUsage,
        limit: input.currentLimit,
        remaining: input.remainingCredits,
        usageKnown: input.usageKnown ?? true,
        monthlyAllowance: input.monthlyAllowance,
        renewalDate: input.renewalDate,
        subscriptionType: input.subscriptionType,
      },
      snapshots: input.usageSnapshots,
    },
    providers: {
      snapshots: input.providerSnapshots,
      health: input.providerHealth,
    },
    config: {
      retentionDays: input.retentionDays,
      alertThresholds: input.alertThresholds,
      runOutDays: input.runOutDays,
      cycleTarget: input.cycleTarget,
      enabledProviders: input.enabledProviders,
      copilotApi: {
        enabled: input.copilotApiConfig.enabled,
        username: input.copilotApiConfig.username,
        tokenPresent: input.copilotTokenPresent,
      },
    },
  };
}

export function buildDiagnosticsPayload(input: DiagnosticsInput): {
  generatedAt: string;
  extension: { id?: string | undefined; version?: string | undefined };
  environment: {
    vscodeVersion: string;
    nodeVersion: string;
    platform: string;
    workspaceTrusted: boolean;
  };
  auth: {
    hasCookie: boolean;
    hasRealData: boolean;
    dataSource: string;
    dataSourceMode?: string | undefined;
    cliDetected?: boolean | undefined;
    cliAuthenticated?: boolean | undefined;
  };
  usage: {
    used: number;
    limit: number;
    remaining: number;
    subscriptionType?: string | undefined;
    renewalDate?: string | undefined;
    lastFetchedAt: string | null;
  };
  config: DiagnosticsInput["config"];
  providers: {
    health: ProviderHealthSnapshot[];
    latestUsage: Record<string, ProviderUsageSnapshot>;
  };
  support: { issueUrl: string };
} {
  return {
    generatedAt: input.generatedAt.toISOString(),
    extension: {
      id: input.extensionId,
      version: input.extensionVersion,
    },
    environment: {
      vscodeVersion: input.vscodeVersion,
      nodeVersion: input.nodeVersion,
      platform: input.platform,
      workspaceTrusted: input.workspaceTrusted,
    },
    auth: {
      hasCookie: input.hasCookie,
      hasRealData: input.hasRealData,
      dataSource: input.dataSource,
      dataSourceMode: input.dataSourceMode,
      cliDetected: input.cliDetected,
      cliAuthenticated: input.cliAuthenticated,
    },
    usage: {
      used: input.usage.used,
      limit: input.usage.limit,
      remaining: input.usage.remaining,
      subscriptionType: input.usage.subscriptionType,
      renewalDate: input.usage.renewalDate,
      lastFetchedAt: input.usage.lastFetchedAt?.toISOString() || null,
    },
    config: {
      refreshInterval: input.config.refreshInterval,
      clickAction: input.config.clickAction,
      showInStatusBar: input.config.showInStatusBar,
      alertThresholds: input.config.alertThresholds,
      runOutDays: input.config.runOutDays,
      cycleTarget: input.config.cycleTarget,
      retentionDays: input.config.retentionDays,
      providerTrackingEnabled: input.config.providerTrackingEnabled,
      enabledProviders: input.config.enabledProviders,
      claudeProjectsPath: redactConfiguredPath(input.config.claudeProjectsPath),
      codexSessionsPath: redactConfiguredPath(input.config.codexSessionsPath),
      copilotStateDbPath: redactConfiguredPath(input.config.copilotStateDbPath),
      copilotApi: {
        enabled: input.config.copilotApi.enabled,
        username: redactUsername(input.config.copilotApi.username),
        tokenPresent: input.config.copilotApi.tokenPresent,
      },
      logLevel: input.config.logLevel,
    },
    providers: {
      health: input.providerHealth.map(redactProviderHealth),
      latestUsage: Object.fromEntries(
        Object.entries(buildLatestProviderSnapshots(input.providerSnapshots)).map(
          ([key, snapshot]) => [key, redactProviderSnapshot(snapshot)]
        )
      ),
    },
    support: {
      issueUrl: input.supportIssueUrl,
    },
  };
}

export function buildDiagnosticsText(input: DiagnosticsInput): string {
  return `Augmeter Diagnostics\n\n${JSON.stringify(buildDiagnosticsPayload(input), null, 2)}`;
}

export function buildLatestProviderSnapshots(
  snapshots: ProviderUsageSnapshot[]
): Record<string, ProviderUsageSnapshot> {
  const latest: Record<string, ProviderUsageSnapshot> = {};
  for (const snapshot of snapshots) {
    const key = `${snapshot.providerId}:${snapshot.windowType}:${snapshot.metricType}`;
    const current = latest[key];
    if (
      !current ||
      new Date(snapshot.timestamp).getTime() > new Date(current.timestamp).getTime()
    ) {
      latest[key] = snapshot;
    }
  }
  return latest;
}

function redactConfiguredPath(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "(default)" ? "(default)" : "[REDACTED]";
}

function redactUsername(value: string): string {
  return value.trim() === "" ? "" : "[REDACTED]";
}

function redactProviderHealth(health: ProviderHealthSnapshot): ProviderHealthSnapshot {
  const redacted: ProviderHealthSnapshot = {
    providerId: health.providerId,
    status: health.status,
    checkedAt: health.checkedAt,
    canCollectInCurrentWorkspace: health.canCollectInCurrentWorkspace,
  };
  if (health.sourceKind !== undefined) {
    redacted.sourceKind = health.sourceKind;
  }
  if (health.errorCode !== undefined) {
    redacted.errorCode = health.errorCode;
  }
  return redacted;
}

function redactProviderSnapshot(snapshot: ProviderUsageSnapshot): ProviderUsageSnapshot {
  const redacted: ProviderUsageSnapshot = {
    providerId: snapshot.providerId,
    timestamp: snapshot.timestamp,
    windowType: snapshot.windowType,
    metricType: snapshot.metricType,
    sourceKind: snapshot.sourceKind,
  };
  if (snapshot.used !== undefined) {
    redacted.used = snapshot.used;
  }
  if (snapshot.limit !== undefined) {
    redacted.limit = snapshot.limit;
  }
  if (snapshot.remaining !== undefined) {
    redacted.remaining = snapshot.remaining;
  }
  if (snapshot.percentUsed !== undefined) {
    redacted.percentUsed = snapshot.percentUsed;
  }
  if (snapshot.resetAt !== undefined) {
    redacted.resetAt = snapshot.resetAt;
  }
  if (snapshot.freshnessAt !== undefined) {
    redacted.freshnessAt = snapshot.freshnessAt;
  }
  if (snapshot.confidence !== undefined) {
    redacted.confidence = snapshot.confidence;
  }
  return redacted;
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/\"/g, '""')}"`;
  }
  return value;
}

function formatRenewalLine(renewalDate: string): string | null {
  try {
    const date = new Date(renewalDate);
    if (!isNaN(date.getTime())) {
      return `Renews: ${date.toLocaleDateString()}`;
    }
  } catch {
    // Ignore invalid dates in copy/export formatting.
  }
  return null;
}
