import { type UsageSnapshot } from "../core/storage/storage-manager";
import {
  type ProviderHealthSnapshot,
  type ProviderUsageSnapshot,
} from "../core/types/provider-usage";

export interface UsageDashboardData {
  generatedAt: Date;
  hasRealData: boolean;
  usage: number;
  limit: number;
  remaining: number;
  percentage: number;
  renewalDate?: string | undefined;
  subscriptionType?: string | undefined;
  usageRatePerHour?: number | null | undefined;
  projectedDaysRemaining?: number | null | undefined;
  projectedDepletionDate?: Date | null | undefined;
  monthlyTarget?: number | null | undefined;
  targetDelta?: number | null | undefined;
  targetProgressPercent?: number | null | undefined;
  sessionActivity?: { promptCount: number; sessionCount: number } | null | undefined;
  snapshots: UsageSnapshot[];
  providerSnapshots?: ProviderUsageSnapshot[] | undefined;
  providerHealth?: ProviderHealthSnapshot[] | undefined;
  providerTargets?: Record<string, number> | undefined;
  providerAlertThresholds?:
    | Record<
        string,
        {
          warning: number;
          high: number;
          critical: number;
          runOutDays: number;
        }
      >
    | undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

function formatDateTime(value: Date): string {
  return value.toLocaleString();
}

function formatRenewalCountdown(renewalDate: string | undefined): string {
  if (!renewalDate) return "Unknown";
  const renewal = new Date(renewalDate);
  if (Number.isNaN(renewal.getTime())) return "Unknown";

  const deltaMs = renewal.getTime() - Date.now();
  if (deltaMs <= 0) return "Due now";

  const days = Math.ceil(deltaMs / (24 * 60 * 60 * 1000));
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

function formatDaysRemaining(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unknown";
  if (value <= 0) return "Exhausted";
  if (value < 1) {
    const hours = Math.max(1, Math.round(value * 24));
    return `~${hours}h`;
  }
  return `~${Math.round(value)} days`;
}

function computeWindowUsage(snapshots: UsageSnapshot[], hours: number): number | null {
  if (snapshots.length < 2) return null;

  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;

  const inWindow = snapshots
    .filter(s => new Date(s.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (inWindow.length < 2) return null;

  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  const delta = last.consumed - first.consumed;
  if (delta < 0) return null;

  return Math.round(delta);
}

function formatTrend(value: number | null): string {
  return value === null ? "Not enough data" : `${formatNumber(value)} used`;
}

interface ProviderSummary {
  providerId: string;
  label: string;
  status: string;
  statusMessage: string;
  lastUpdated: string;
  rollingFiveHourMessages: number | null;
  weeklyMessages: number | null;
  weeklyDeltaMessages: number | null;
  monthlyMessages: number | null;
  cumulativeMessages: number | null;
  riskPercent: number | null;
  riskLabel: string;
  riskHeading: string;
}

function providerLabel(providerId: string): string {
  if (providerId === "augment") return "Augment";
  if (providerId === "claude") return "Claude Code";
  if (providerId === "codex") return "Codex (local prompts)";
  if (providerId === "copilot") return "GitHub Copilot";
  return providerId;
}

function providerMetricNoun(providerId: string): string {
  return providerId === "codex" ? "prompts" : "messages";
}

function summarizeProviders(
  snapshots: ProviderUsageSnapshot[],
  health: ProviderHealthSnapshot[],
  providerTargets: Record<string, number>,
  providerAlertThresholds: Record<
    string,
    {
      warning: number;
      high: number;
      critical: number;
      runOutDays: number;
    }
  >
): ProviderSummary[] {
  const providerIds = new Set<string>();
  for (const snapshot of snapshots) {
    providerIds.add(snapshot.providerId);
  }
  for (const item of health) {
    providerIds.add(item.providerId);
  }
  providerIds.delete("augment");

  const healthByProvider = new Map<string, ProviderHealthSnapshot>();
  for (const item of health) {
    healthByProvider.set(item.providerId, item);
  }

  const findLatest = (
    providerId: string,
    windowType: ProviderUsageSnapshot["windowType"],
    offset: number = 0
  ): ProviderUsageSnapshot | null => {
    const candidates = snapshots
      .filter(
        snapshot =>
          snapshot.providerId === providerId &&
          snapshot.metricType === "messages" &&
          snapshot.windowType === windowType
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return candidates[offset] ?? null;
  };

  const knownOrder = ["augment", "claude", "copilot", "codex"];
  const ordered = Array.from(providerIds).sort((a, b) => {
    const aIndex = knownOrder.indexOf(a);
    const bIndex = knownOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return ordered.map(providerId => {
    const providerHealth = healthByProvider.get(providerId);
    const rolling = findLatest(providerId, "rolling_5h");
    const weekly = findLatest(providerId, "weekly_7d");
    const previousWeekly = findLatest(providerId, "weekly_7d", 1);
    const monthly = findLatest(providerId, "monthly");
    const cumulative = findLatest(providerId, "custom");

    const lastUpdatedTimestamp =
      rolling?.timestamp ||
      weekly?.timestamp ||
      monthly?.timestamp ||
      cumulative?.timestamp ||
      providerHealth?.checkedAt ||
      null;

    const target = providerTargets[providerId];
    const thresholds = providerAlertThresholds[providerId] || {
      warning: 75,
      high: 90,
      critical: 95,
      runOutDays: 3,
    };
    const usesConfiguredTarget =
      typeof target === "number" && Number.isFinite(target) && target > 0;

    let riskPercent: number | null = null;
    if (usesConfiguredTarget) {
      if (typeof weekly?.used === "number" && Number.isFinite(weekly.used)) {
        const projectedMonthly = (weekly.used / 7) * 30;
        riskPercent = Math.round((projectedMonthly / target) * 100);
      } else if (typeof monthly?.used === "number" && Number.isFinite(monthly.used)) {
        riskPercent = Math.round((monthly.used / target) * 100);
      } else if (typeof cumulative?.used === "number" && Number.isFinite(cumulative.used)) {
        riskPercent = Math.round((cumulative.used / target) * 100);
      }
    } else if (typeof monthly?.percentUsed === "number" && Number.isFinite(monthly.percentUsed)) {
      riskPercent = Math.round(monthly.percentUsed);
    } else if (
      typeof cumulative?.percentUsed === "number" &&
      Number.isFinite(cumulative.percentUsed)
    ) {
      riskPercent = Math.round(cumulative.percentUsed);
    }

    let riskLabel = "No target signal";
    if (riskPercent !== null) {
      if (riskPercent >= thresholds.critical) {
        riskLabel = "Critical risk";
      } else if (riskPercent >= thresholds.high) {
        riskLabel = "High risk";
      } else if (riskPercent >= thresholds.warning) {
        riskLabel = "Warning risk";
      } else {
        riskLabel = "On track";
      }
    }

    return {
      providerId,
      label: providerLabel(providerId),
      status: providerHealth?.status ?? "unknown",
      statusMessage: providerHealth?.message ?? "No health data yet",
      lastUpdated: lastUpdatedTimestamp
        ? new Date(lastUpdatedTimestamp).toLocaleString()
        : "Unknown",
      rollingFiveHourMessages: rolling?.used ?? null,
      weeklyMessages: weekly?.used ?? null,
      weeklyDeltaMessages:
        weekly?.used !== undefined &&
        weekly?.used !== null &&
        previousWeekly?.used !== undefined &&
        previousWeekly?.used !== null
          ? weekly.used - previousWeekly.used
          : null,
      monthlyMessages: monthly?.used ?? null,
      cumulativeMessages: cumulative?.used ?? null,
      riskPercent,
      riskLabel,
      riskHeading: usesConfiguredTarget ? "Target risk" : "Risk",
    };
  });
}

function renderTargetCard(
  monthlyTarget: number | null | undefined,
  targetDelta: number | null | undefined,
  targetProgressPercent: number | null | undefined
): string {
  if (!monthlyTarget || monthlyTarget <= 0 || targetDelta === null || targetDelta === undefined) {
    return `
      <div class="metric-card">
        <h3>Monthly Target</h3>
        <p class="metric-value">Disabled</p>
        <p class="metric-subtle">Set augmeter.budget.monthlyTarget to enable.</p>
      </div>
    `;
  }

  const progress = targetProgressPercent ?? 0;
  const status =
    targetDelta >= 0
      ? `${formatNumber(Math.abs(targetDelta))} under target`
      : `${formatNumber(Math.abs(targetDelta))} over target`;

  return `
    <div class="metric-card">
      <h3>Monthly Target</h3>
      <p class="metric-value">${formatNumber(monthlyTarget)} credits</p>
      <p class="metric-subtle">${escapeHtml(status)} (${progress}%)</p>
    </div>
  `;
}

export function renderUsageDashboard(data: UsageDashboardData): string {
  const used24h = computeWindowUsage(data.snapshots, 24);
  const used7d = computeWindowUsage(data.snapshots, 24 * 7);
  const used30d = computeWindowUsage(data.snapshots, 24 * 30);
  const renewal = formatDate(data.renewalDate);
  const projectedDate = formatDate(data.projectedDepletionDate);
  const renewalCountdown = formatRenewalCountdown(data.renewalDate);
  const usageRate =
    data.usageRatePerHour === null || data.usageRatePerHour === undefined
      ? "Unknown"
      : `${formatNumber(data.usageRatePerHour)}/hr`;
  const planName = data.subscriptionType ? escapeHtml(data.subscriptionType) : "Unknown";
  const generatedAt = escapeHtml(formatDateTime(data.generatedAt));
  const ratioWidth = Math.max(0, Math.min(100, data.percentage));
  const lastSnapshots = data.snapshots
    .slice(-8)
    .map(s => `${new Date(s.timestamp).toLocaleDateString()}: ${formatNumber(s.consumed)}`)
    .reverse();
  const snapshotsMarkup =
    lastSnapshots.length > 0
      ? lastSnapshots.map(v => `<li>${escapeHtml(v)}</li>`).join("")
      : "<li>No history yet</li>";
  const sessionActivity = data.sessionActivity
    ? `${data.sessionActivity.promptCount} prompts across ${data.sessionActivity.sessionCount} sessions`
    : "Disabled or unavailable";
  const providerSummaries = summarizeProviders(
    data.providerSnapshots ?? [],
    data.providerHealth ?? [],
    data.providerTargets ?? {},
    data.providerAlertThresholds ?? {}
  );
  const providerMarkup =
    providerSummaries.length > 0
      ? providerSummaries
          .map(summary => {
            const lines: string[] = [];
            const metricNoun = providerMetricNoun(summary.providerId);
            if (summary.rollingFiveHourMessages !== null) {
              lines.push(`5h: ${formatNumber(summary.rollingFiveHourMessages)} ${metricNoun}`);
            }
            if (summary.weeklyMessages !== null) {
              lines.push(`7d: ${formatNumber(summary.weeklyMessages)} ${metricNoun}`);
            }
            if (summary.weeklyDeltaMessages !== null) {
              const sign = summary.weeklyDeltaMessages >= 0 ? "+" : "-";
              lines.push(
                `7d trend: ${sign}${formatNumber(Math.abs(summary.weeklyDeltaMessages))} ${metricNoun} vs previous`
              );
            }
            if (summary.monthlyMessages !== null) {
              lines.push(`Month: ${formatNumber(summary.monthlyMessages)} ${metricNoun}`);
            }
            if (summary.cumulativeMessages !== null) {
              lines.push(`Total: ${formatNumber(summary.cumulativeMessages)} ${metricNoun}`);
            }
            if (lines.length === 0) {
              lines.push("No usage snapshots yet");
            }

            return `
              <div class="metric-card">
                <h3>${escapeHtml(summary.label)}</h3>
                <p class="metric-subtle">Status: ${escapeHtml(summary.status)}</p>
                <p class="metric-subtle">${escapeHtml(summary.statusMessage)}</p>
                <p class="metric-subtle">${escapeHtml(summary.riskHeading)}: ${escapeHtml(summary.riskLabel)}${summary.riskPercent !== null ? ` (${summary.riskPercent}%)` : ""}</p>
                <p class="metric-subtle">${escapeHtml(lines.join(" • "))}</p>
                <p class="metric-subtle">Updated: ${escapeHtml(summary.lastUpdated)}</p>
              </div>
            `;
          })
          .join("\n")
      : `<p class="metric-subtle">No provider data available yet.</p>`;
  const unavailableDataNotice = !data.hasRealData
    ? `
      <div class="notice-card" role="status" aria-live="polite">
        <h2>Augment credit data unavailable</h2>
        <p class="metric-subtle">
          Sign in or refresh to load current cycle, burn rate, and renewal details.
          ${providerSummaries.length > 0 ? " Local provider activity may still appear below." : ""}
        </p>
      </div>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Augmeter Usage Dashboard</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 20px;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }
      h1, h2, h3 {
        margin: 0 0 8px 0;
        font-weight: 600;
      }
      .subtitle {
        margin: 0 0 20px 0;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .metric-card {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        padding: 12px;
        background: var(--vscode-editorWidget-background);
      }
      .notice-card {
        border: 1px solid var(--vscode-panel-border);
        border-left: 4px solid var(--vscode-progressBar-background);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
        background: var(--vscode-editorWidget-background);
      }
      .metric-value {
        font-size: 20px;
        font-weight: 700;
        margin: 6px 0 0;
      }
      .metric-subtle {
        margin: 6px 0 0;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }
      .section {
        margin-top: 16px;
      }
      .progress {
        width: 100%;
        height: 10px;
        border-radius: 999px;
        background: var(--vscode-editor-inactiveSelectionBackground);
        overflow: hidden;
        margin-top: 8px;
      }
      .bar {
        height: 100%;
        background: var(--vscode-progressBar-background);
        width: ${ratioWidth}%;
      }
      ul {
        margin: 8px 0 0;
        padding-left: 18px;
      }
      li {
        margin: 4px 0;
      }
    </style>
  </head>
  <body>
    <h1>Augmeter Usage Dashboard</h1>
    <p class="subtitle">Plan: ${planName} • Generated: ${generatedAt}</p>
    ${unavailableDataNotice}

    <div class="grid">
      <div class="metric-card">
        <h3>Current Cycle</h3>
        <p class="metric-value">${formatNumber(data.usage)} / ${formatNumber(data.limit)}</p>
        <p class="metric-subtle">${formatNumber(data.remaining)} remaining (${data.percentage}%)</p>
        <div class="progress"><div class="bar"></div></div>
      </div>
      <div class="metric-card">
        <h3>Burn Rate</h3>
        <p class="metric-value">${escapeHtml(usageRate)}</p>
        <p class="metric-subtle">Projected: ${escapeHtml(formatDaysRemaining(data.projectedDaysRemaining))}</p>
        <p class="metric-subtle">Depletion date: ${projectedDate ?? "Unknown"}</p>
      </div>
      <div class="metric-card">
        <h3>Renewal</h3>
        <p class="metric-value">${renewal ?? "Unknown"}</p>
        <p class="metric-subtle">${escapeHtml(renewalCountdown)}</p>
      </div>
      ${renderTargetCard(data.monthlyTarget, data.targetDelta, data.targetProgressPercent)}
    </div>

    <div class="section">
      <h2>Usage Trends</h2>
      <div class="grid">
        <div class="metric-card">
          <h3>24h</h3>
          <p class="metric-value">${escapeHtml(formatTrend(used24h))}</p>
        </div>
        <div class="metric-card">
          <h3>7d</h3>
          <p class="metric-value">${escapeHtml(formatTrend(used7d))}</p>
        </div>
        <div class="metric-card">
          <h3>30d</h3>
          <p class="metric-value">${escapeHtml(formatTrend(used30d))}</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Session Activity</h2>
      <p class="metric-subtle">${escapeHtml(sessionActivity)}</p>
    </div>

    <div class="section">
      <h2>Cross-Provider Usage</h2>
      <div class="grid">${providerMarkup}</div>
    </div>

    <div class="section">
      <h2>Recent Snapshot History</h2>
      <ul>${snapshotsMarkup}</ul>
    </div>
  </body>
</html>`;
}
