import { type UsageSnapshot } from "../core/storage/storage-manager";

export interface UsageDashboardData {
  generatedAt: Date;
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
      <h2>Recent Snapshot History</h2>
      <ul>${snapshotsMarkup}</ul>
    </div>
  </body>
</html>`;
}
