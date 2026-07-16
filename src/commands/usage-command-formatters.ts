import type { CopilotApiConfig, ProviderAlertThresholdConfig } from "../core/config/config-manager";
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
  providerTargets: Record<string, number>;
  providerAlertThresholds: Record<string, ProviderAlertThresholdConfig>;
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
    displayMode: string;
    density: string;
    showInStatusBar: boolean;
    colorScheme: string;
    colorThresholds: { critical: number; highWarning: number; warning: number; caution: number };
    alertThresholds: { warning: number; high: number; critical: number };
    runOutDays: number;
    cycleTarget: number;
    retentionDays: number;
    sessionTrackingEnabled: boolean;
    sessionTrackingPath: string;
    providerTrackingEnabled: boolean;
    enabledProviders: readonly string[];
    providerTargets: Record<string, number>;
    providerAlertThresholds: Record<string, ProviderAlertThresholdConfig>;
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
  const remaining = input.remainingCredits ?? (limit > 0 ? Math.max(limit - usage, 0) : 0);
  const lines: string[] = ["Augment credit summary"];

  if (subscriptionType) {
    lines.push(`Plan: ${subscriptionType}`);
  }

  if (usageKnown) {
    lines.push(
      `Used: ${usage.toLocaleString()} of ${limit.toLocaleString()} credits (${percentage}%)`
    );
    lines.push(`Remaining: ${remaining.toLocaleString()} credits`);
  } else {
    lines.push(`Remaining: ${remaining.toLocaleString()} credits`);
    if (monthlyAllowance !== null && monthlyAllowance !== undefined) {
      lines.push(`Monthly allowance: ${monthlyAllowance.toLocaleString()} credits`);
    }
    lines.push("Cycle usage: unavailable from Auggie CLI balance data");
  }

  if (usageKnown && cycleTarget > 0 && targetDelta !== null) {
    lines.push(
      `Cycle target: ${cycleTarget.toLocaleString()} credits (${targetDelta >= 0 ? `${Math.abs(targetDelta).toLocaleString()} under` : `${Math.abs(targetDelta).toLocaleString()} over`})`
    );
  }

  if (usageKnown && projectedDays !== null) {
    if (projectedDays <= 0) {
      lines.push("At this pace: credits exhausted");
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
    targets: Record<string, number>;
    alerts: Record<string, ProviderAlertThresholdConfig>;
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
      tokenEnvVar: string;
      tokenPresent: boolean;
      baseUrl: string;
      timeoutMs: number;
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
      targets: input.providerTargets,
      alerts: input.providerAlertThresholds,
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
        tokenEnvVar: input.copilotApiConfig.tokenEnvVar,
        tokenPresent: input.copilotTokenPresent,
        baseUrl: input.copilotApiConfig.baseUrl,
        timeoutMs: input.copilotApiConfig.timeoutMs,
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
    config: input.config,
    providers: {
      health: input.providerHealth,
      latestUsage: buildLatestProviderSnapshots(input.providerSnapshots),
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
