import { randomUUID } from "node:crypto";
import { type UsageSnapshot } from "../core/storage/storage-manager";
import {
  type ProviderHealthSnapshot,
  type ProviderUsageSnapshot,
} from "../core/types/provider-usage";
import {
  pluralize,
  providerDisplayName,
  providerHealthText,
  providerMetricNoun,
} from "../core/copy/provider-copy";

export interface UsageDashboardData {
  generatedAt: Date;
  hasRealData: boolean;
  enabled?: boolean;
  augmentConnected?: boolean;
  usage: number;
  limit: number;
  remaining: number;
  percentage: number;
  usageKnown?: boolean | undefined;
  monthlyAllowance?: number | null | undefined;
  creditFreshnessAt?: Date | undefined;
  renewalDate?: string | undefined;
  subscriptionType?: string | undefined;
  usageRatePerHour?: number | null | undefined;
  projectedDaysRemaining?: number | null | undefined;
  projectedDepletionDate?: Date | null | undefined;
  monthlyTarget?: number | null | undefined;
  targetDelta?: number | null | undefined;
  targetProgressPercent?: number | null | undefined;
  snapshots: UsageSnapshot[];
  providerSnapshots?: ProviderUsageSnapshot[] | undefined;
  providerHealth?: ProviderHealthSnapshot[] | undefined;
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

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDate(value: string | Date | null | undefined): string | null {
  return (
    toValidDate(value)?.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) ?? null
  );
}

function formatDateTime(value: string | Date | null | undefined): string | null {
  return toValidDate(value)?.toLocaleString() ?? null;
}

function formatDaysRemaining(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value <= 0) return "Exhausted";
  if (value < 1) {
    const hours = Math.max(1, Math.round(value * 24));
    return `~${hours}h`;
  }
  const days = Math.max(1, Math.round(value));
  return `~${days} ${pluralize(days, "day")}`;
}

function computeWindowUsage(snapshots: UsageSnapshot[], hours: number, now: number): number | null {
  if (snapshots.length < 2) return null;

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
  return value === null ? "" : `${formatNumber(value)} credits used`;
}

interface ProviderSummary {
  providerId: string;
  label: string;
  healthText: string;
  rollingFiveHourMessages: number | null;
  weeklyMessages: number | null;
  health: ProviderHealthSnapshot | undefined;
  monthlyMessages: number | null;
  cumulativeMessages: number | null;
  riskPercent: number | null;
  monthlySourceKind: ProviderUsageSnapshot["sourceKind"] | null;
  cumulativeSourceKind: ProviderUsageSnapshot["sourceKind"] | null;
  freshnessAt: string | null;
}

function summarizeProviders(
  snapshots: ProviderUsageSnapshot[],
  health: ProviderHealthSnapshot[]
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
    windowType: ProviderUsageSnapshot["windowType"]
  ): ProviderUsageSnapshot | null => {
    const candidates = snapshots
      .filter(
        snapshot =>
          snapshot.providerId === providerId &&
          snapshot.metricType === "messages" &&
          snapshot.windowType === windowType
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return candidates[0] ?? null;
  };

  const knownOrder = ["augment", "claude", "codex", "copilot"];
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
    const monthly = findLatest(providerId, "monthly");
    const cumulative = findLatest(providerId, "custom");
    const freshnessAt =
      [rolling, weekly, monthly, cumulative]
        .filter((snapshot): snapshot is ProviderUsageSnapshot => snapshot !== null)
        .map(snapshot => snapshot.freshnessAt ?? snapshot.timestamp)
        .filter(value => toValidDate(value) !== null)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    const riskPercent =
      typeof monthly?.percentUsed === "number" && Number.isFinite(monthly.percentUsed)
        ? Math.round(monthly.percentUsed)
        : null;

    return {
      providerId,
      label: providerDisplayName(providerId),
      healthText: providerHealthText(providerHealth),
      rollingFiveHourMessages: rolling?.used ?? null,
      weeklyMessages: weekly?.used ?? null,
      health: providerHealth,
      monthlyMessages: monthly?.used ?? null,
      cumulativeMessages: cumulative?.used ?? null,
      riskPercent,
      monthlySourceKind: monthly?.sourceKind ?? null,
      cumulativeSourceKind: cumulative?.sourceKind ?? null,
      freshnessAt,
    };
  });
}

function renderTargetCard(
  monthlyTarget: number | null | undefined,
  targetDelta: number | null | undefined,
  targetProgressPercent: number | null | undefined
): string {
  if (!monthlyTarget || monthlyTarget <= 0 || targetDelta === null || targetDelta === undefined) {
    return "";
  }

  const progress = targetProgressPercent ?? 0;
  const status =
    targetDelta >= 0
      ? `${formatNumber(Math.abs(targetDelta))} credits under target`
      : `${formatNumber(Math.abs(targetDelta))} credits over target`;

  return `
    <div class="metric-card">
      <h3>Cycle target</h3>
      <p class="metric-value">${formatNumber(monthlyTarget)} credits</p>
      <p class="metric-subtle">${progress}% used · ${escapeHtml(status)}</p>
    </div>
  `;
}

export function renderUsageDashboard(data: UsageDashboardData): string {
  const styleNonce = randomUUID();
  const usageKnown = data.usageKnown !== false;
  const used24h = computeWindowUsage(data.snapshots, 24, data.generatedAt.getTime());
  const used7d = computeWindowUsage(data.snapshots, 24 * 7, data.generatedAt.getTime());
  const used30d = computeWindowUsage(data.snapshots, 24 * 30, data.generatedAt.getTime());
  const renewal = formatDate(data.renewalDate);
  const projectedDate = formatDate(data.projectedDepletionDate);
  const ratioWidth = Math.max(0, Math.min(100, data.percentage));
  const providerSummaries = summarizeProviders(
    data.providerSnapshots ?? [],
    data.providerHealth ?? []
  );
  const augmentHealth = data.providerHealth?.find(health => health.providerId === "augment");
  const creditProblem =
    augmentHealth?.status === "unavailable" || augmentHealth?.status === "degraded";
  const providerMarkup =
    providerSummaries.length > 0
      ? providerSummaries
          .map(summary => {
            const lines: string[] = [];
            const metricNoun = providerMetricNoun(summary.providerId);
            const hasOfficialUsage =
              (summary.monthlyMessages !== null && summary.monthlySourceKind === "api") ||
              (summary.cumulativeMessages !== null && summary.cumulativeSourceKind === "api");
            const sourceLabel = hasOfficialUsage
              ? summary.providerId === "copilot"
                ? "Reported by GitHub"
                : "Provider-reported usage"
              : summary.providerId === "claude" || summary.providerId === "codex"
                ? "From local session history"
                : summary.providerId === "copilot"
                  ? "From VS Code on this device"
                  : "Local activity";
            if (summary.rollingFiveHourMessages !== null) {
              const count = Math.round(summary.rollingFiveHourMessages);
              lines.push(`Last 5 hours: ${formatNumber(count)} ${pluralize(count, metricNoun)}`);
            }
            if (summary.weeklyMessages !== null) {
              const count = Math.round(summary.weeklyMessages);
              lines.push(`Last 7 days: ${formatNumber(count)} ${pluralize(count, metricNoun)}`);
            }
            if (summary.monthlyMessages !== null) {
              const count = Math.round(summary.monthlyMessages);
              const label =
                summary.providerId === "copilot" && summary.monthlySourceKind === "api"
                  ? "premium requests"
                  : pluralize(count, metricNoun);
              lines.push(`This month: ${formatNumber(count)} ${label}`);
            }
            if (summary.cumulativeMessages !== null) {
              const count = Math.round(summary.cumulativeMessages);
              if (summary.providerId === "copilot" && summary.cumulativeSourceKind === "api") {
                lines.push(`${formatNumber(count)} premium requests`);
                lines.push("Current billing period");
              } else {
                if (summary.providerId === "copilot") {
                  lines.push(`${formatNumber(count)} requests recorded`);
                  lines.push("VS Code doesn't provide a time range for this count");
                } else {
                  lines.push(`${formatNumber(count)} ${pluralize(count, metricNoun)}`);
                  lines.push("Recorded locally");
                }
              }
            }
            const primary = lines.shift();
            const healthNotice =
              summary.health && summary.health.status !== "connected"
                ? `<p class="metric-state">${escapeHtml(summary.healthText.charAt(0).toUpperCase() + summary.healthText.slice(1))}${primary ? ". Last recorded values shown." : "."}</p>`
                : "";
            const targetLine =
              summary.riskPercent === null
                ? ""
                : `${summary.riskPercent}% of the reported limit used`;
            const details = lines
              .map(line => `<p class="metric-subtle">${escapeHtml(line)}</p>`)
              .join("");
            const freshness = formatDateTime(summary.freshnessAt);

            return `
              <div class="metric-card">
                <h3>${escapeHtml(summary.label)}</h3>
                <p class="metric-source">${sourceLabel}</p>
                ${primary ? `<p class="metric-value">${escapeHtml(primary)}</p>` : ""}
                ${healthNotice || (!primary ? `<p class="metric-state">${escapeHtml(summary.healthText.charAt(0).toUpperCase() + summary.healthText.slice(1))}.</p>` : "")}
                ${details}
                ${targetLine ? `<p class="metric-subtle">${escapeHtml(targetLine)}</p>` : ""}
                ${freshness ? `<p class="metric-freshness">Updated ${escapeHtml(freshness)}</p>` : ""}
              </div>
            `;
          })
          .join("\n")
      : `<p class="metric-subtle">No assistant activity recorded yet. Choose assistants in Settings, use one, then refresh.</p>`;
  const unavailableDataNotice = !data.hasRealData
    ? `<section class="notice-card" aria-labelledby="connect-heading">
        <h2 id="connect-heading">${creditProblem ? "Augment credits unavailable" : data.augmentConnected ? "Waiting for Augment credits" : "Augment credits aren&#39;t connected"}</h2>
        <p class="metric-subtle">${creditProblem ? escapeHtml(augmentHealth.message ?? "Couldn’t refresh Augment credits. Try again.") : data.augmentConnected ? "Refresh to load your credit balance." : "Connect Augment to see your credit balance alongside local activity."}</p>
        ${!data.augmentConnected || augmentHealth?.errorCode === "AUGMENT_UNAUTHENTICATED" ? '<button id="connect-augment" data-command="augmeter.signIn">Connect Augment</button>' : ""}
      </section>`
    : "";
  const planLine = data.subscriptionType
    ? `<p class="metric-subtle">Plan: ${escapeHtml(data.subscriptionType)}</p>`
    : "";
  const creditFreshness = formatDateTime(data.creditFreshnessAt);
  const creditFreshnessLine = creditFreshness
    ? `<p class="metric-freshness">Updated ${escapeHtml(creditFreshness)}</p>`
    : "";
  const paceDetails: string[] = [];
  if (
    usageKnown &&
    data.usageRatePerHour !== null &&
    data.usageRatePerHour !== undefined &&
    data.usageRatePerHour > 0
  ) {
    paceDetails.push(`About ${formatNumber(data.usageRatePerHour)} credits per hour`);
  }
  const projectedRemaining = usageKnown ? formatDaysRemaining(data.projectedDaysRemaining) : "";
  if (projectedRemaining) {
    paceDetails.push(`At this pace: ${projectedRemaining} left`);
  }
  if (usageKnown && projectedDate) {
    paceDetails.push(`Estimated run-out: ${projectedDate}`);
  }
  const paceCard =
    paceDetails.length > 0
      ? `<div class="metric-card"><h3>Credit pace</h3>${paceDetails
          .map((line, index) =>
            index === 0
              ? `<p class="metric-value">${escapeHtml(line)}</p>`
              : `<p class="metric-subtle">${escapeHtml(line)}</p>`
          )
          .join("")}</div>`
      : "";
  const renewalCard = renewal
    ? `<div class="metric-card"><h3>Renewal</h3><p class="metric-value">${escapeHtml(renewal)}</p>${creditFreshnessLine}</div>`
    : "";
  const currentCycleCard = !usageKnown
    ? `<div class="metric-card">
          <h3>Credit balance</h3>
          <p class="metric-value">${formatNumber(data.remaining)} credits left</p>
          ${
            data.monthlyAllowance !== null && data.monthlyAllowance !== undefined
              ? `<p class="metric-subtle">Monthly allowance: ${formatNumber(data.monthlyAllowance)} credits</p>`
              : ""
          }
          <p class="metric-subtle">Auggie reports your balance but not what you&#39;ve used this cycle</p>
          ${planLine}
          ${creditFreshnessLine}
        </div>`
    : data.limit > 0
      ? `<div class="metric-card">
          <h3>Current cycle</h3>
          <p class="metric-value">${formatNumber(data.remaining)} credits left</p>
          <p class="metric-subtle">${formatNumber(data.usage)} used this cycle · ${data.percentage}% used</p>
          ${planLine}
          ${creditFreshnessLine}
          <meter min="0" max="100" value="${ratioWidth}" aria-label="Augment cycle credits used" aria-valuetext="${data.percentage}% used">${data.percentage}% used</meter>
        </div>`
      : `<div class="metric-card">
          <h3>Current cycle</h3>
          <p class="metric-value">${formatNumber(data.usage)} credits used</p>
          <p class="metric-subtle">Augment didn&#39;t provide a cycle limit</p>
          ${planLine}
          ${creditFreshnessLine}
        </div>`;
  const augmentMarkup = data.hasRealData
    ? `<div class="section">
        <h2>Augment credits</h2>
        <p class="metric-subtle section-description">Official balance and cycle data from Augment.</p>
        ${creditProblem ? `<p class="metric-state" role="status">${escapeHtml(augmentHealth.message ?? "Couldn’t refresh Augment credits. Last recorded values shown.")}</p>` : ""}
        <div class="grid">
          ${currentCycleCard}
          ${paceCard}
          ${renewalCard}
          ${usageKnown ? renderTargetCard(data.monthlyTarget, data.targetDelta, data.targetProgressPercent) : ""}
        </div>
      </div>`
    : "";
  const trendValues = [used24h, used7d, used30d];
  const trendsMarkup =
    data.hasRealData && usageKnown
      ? `<div class="section">
        <h2>Augment credit trends</h2>
        <p class="metric-subtle section-description">Changes between saved readings within each window. Partial history may cover less time.</p>
        ${
          trendValues.some(value => value !== null)
            ? `<div class="grid">${[
                ["24 hours", used24h],
                ["7 days", used7d],
                ["30 days", used30d],
              ]
                .map(
                  ([label, value]) =>
                    `<div class="metric-card"><h3>${label}</h3><p class="metric-value">${escapeHtml(
                      formatTrend(value as number | null) || "Not enough history"
                    )}</p></div>`
                )
                .join("")}</div>`
            : `<p class="metric-subtle">Not enough credit history yet. Refresh later to build trends.</p>`
        }
      </div>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${styleNonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Augmeter assistant usage</title>
    <style nonce="${styleNonce}">
      :root {
        color-scheme: light dark;
        --space-small: 8px;
        --space-card: 12px;
        --space-section: 16px;
        --surface-border: var(--vscode-contrastBorder, var(--vscode-panel-border));
      }
      body {
        font-family: var(--vscode-font-family, sans-serif);
        font-size: var(--vscode-font-size, 13px);
        line-height: 1.5;
        margin: 0;
        padding: 20px;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        box-sizing: border-box;
      }
      main { max-width: 1100px; margin: 0 auto; }
      h1 { font-size: 1.7em; }
      h2 { font-size: 1.25em; }
      h3 { font-size: 1em; }
      h1, h2, h3 {
        margin: 0 0 8px 0;
        font-weight: 600;
      }
      .subtitle {
        margin: 0 0 20px 0;
        color: var(--vscode-descriptionForeground);
        font-size: 1em;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
        gap: var(--space-card);
      }
      .metric-card {
        border: 1px solid var(--surface-border);
        border-radius: 8px;
        padding: var(--space-card);
        background: var(--vscode-editorWidget-background);
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .notice-card {
        border: 1px solid var(--surface-border);
        border-left: 4px solid var(--vscode-progressBar-background);
        border-radius: 8px;
        padding: var(--space-card);
        margin: 16px 0;
        background: var(--vscode-editorWidget-background);
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .metric-value {
        font-size: 1.5em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        margin: 6px 0 0;
      }
      .metric-subtle {
        margin: 6px 0 0;
        color: var(--vscode-descriptionForeground);
        font-size: 1em;
      }
      .section-description {
        margin-bottom: 12px;
      }
      .metric-source {
        margin: 0;
        color: var(--vscode-descriptionForeground);
        font-size: 0.95em;
        font-weight: 400;
      }
      .metric-freshness {
        margin: 10px 0 0;
        color: var(--vscode-descriptionForeground);
        font-size: 0.95em;
        font-variant-numeric: tabular-nums;
      }
      .methodology {
        margin: 8px 0 12px;
        color: var(--vscode-descriptionForeground);
        font-size: 1em;
      }
      .methodology summary {
        cursor: pointer;
        line-height: 28px;
        min-height: 28px;
        width: fit-content;
      }
      :is(button, summary):focus-visible {
        outline: 2px solid var(--vscode-focusBorder);
        outline-offset: 2px;
      }
      .methodology p {
        margin: 4px 0 0;
        max-width: 72ch;
      }
      .section {
        margin-top: 16px;
      }
      .actions { display: flex; flex-wrap: wrap; gap: var(--space-small); margin: 12px 0; }
      button {
        font: inherit;
        line-height: 1.4;
        min-height: 32px;
        padding: 5px 12px;
        border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
        border-radius: 3px;
        color: var(--vscode-button-secondaryForeground);
        background: var(--vscode-button-secondaryBackground);
        cursor: pointer;
      }
      button:hover { background: var(--vscode-button-secondaryHoverBackground); }
      button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
      button.primary:hover { background: var(--vscode-button-hoverBackground); }
      button:disabled { opacity: 0.6; cursor: wait; }
      .metric-state { font-size: 1em; margin: 8px 0; }
      .notice-card button { margin-top: 12px; }
      .refresh-status { min-height: 1.5em; margin: 0; color: var(--vscode-descriptionForeground); }
      .secondary-actions { margin-top: var(--space-section); border-top: 1px solid var(--surface-border); padding-top: 12px; }
      summary { cursor: pointer; min-height: 28px; width: fit-content; }
      meter { display: block; width: 100%; height: 12px; margin-top: 8px; }
      meter::-webkit-meter-bar { background: var(--vscode-input-background); border: 1px solid var(--surface-border); }
      meter::-webkit-meter-optimum-value { background: var(--vscode-progressBar-background); }
      @media (max-width: 520px) {
        body {
          padding: var(--space-card);
        }
        .grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .metric-value {
          font-size: 1.4em;
        }
      }
    </style>
  </head>
  <body>
    <main id="dashboard">
    <h1>Assistant usage</h1>
    <p class="subtitle">Local activity and provider-reported usage, separated by source.</p>
    <nav class="actions" aria-label="Usage actions">
      <button class="primary" id="refresh" data-command="augmeter.manualRefresh" ${data.enabled === false ? "disabled" : ""}>Refresh</button>
      <button id="settings" data-command="augmeter.openSettings">Settings</button>
    </nav>
    <p id="refresh-status" class="refresh-status" role="status" aria-live="polite"></p>
    <div id="usage-content">
    ${data.enabled === false ? '<p class="notice-card" role="status">Augmeter is paused. Enable it in Settings to resume collection. Last recorded values shown.</p>' : ""}
    <section class="section" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Assistant activity</h2>
      <details class="methodology" id="methodology">
        <summary id="methodology-toggle">How these counts are calculated</summary>
        <p>Claude Code and Codex counts come from local session history. Tool results, metadata, and agent sessions are excluded. VS Code does not provide a time range for local Copilot requests. These counts show activity, not provider quotas.</p>
      </details>
      <div class="grid">${providerMarkup}</div>
    </section>
    ${unavailableDataNotice}
    ${augmentMarkup}
    ${trendsMarkup}
    <details class="secondary-actions" id="more-actions">
      <summary id="more-actions-toggle">Exports and support</summary>
      <div class="actions">
        <button id="export-json" data-command="augmeter.exportUsageBundleJson">Export all usage (JSON)</button>
        ${data.snapshots.length ? '<button id="export-csv" data-command="augmeter.exportUsageHistoryCsv">Export credit history (CSV)</button>' : ""}
        ${data.hasRealData ? '<button id="copy-summary" data-command="augmeter.copyUsageSummary">Copy credit summary</button>' : ""}
        <button id="diagnostics" data-command="augmeter.runDiagnostics">Copy diagnostics</button>
        ${data.hasRealData || data.augmentConnected ? '<button id="disconnect" data-command="augmeter.signOut">Disconnect Augment</button>' : ""}
      </div>
    </details>
    </div>
    </main>
    <script nonce="${styleNonce}">
      const vscode = acquireVsCodeApi();
      const content = document.getElementById('usage-content');
      const refresh = document.getElementById('refresh');
      const status = document.getElementById('refresh-status');
      let refreshing = false;
      let restoreRefreshFocus = false;
      document.addEventListener('click', event => {
        const button = event.target.closest('button[data-command]');
        if (!button || button.disabled) return;
        if (button === refresh) {
          restoreRefreshFocus = document.activeElement === refresh;
          refreshing = true;
          refresh.disabled = true;
          refresh.textContent = 'Refreshing…';
          content.setAttribute('aria-busy', 'true');
          status.textContent = 'Refreshing enabled sources…';
        }
        vscode.postMessage({ command: button.dataset.command });
      });
      window.addEventListener('message', ({ data }) => {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'update' && typeof data.html === 'string') {
          const next = new DOMParser().parseFromString(data.html, 'text/html');
          const activeId = document.activeElement?.id;
          const openIds = Array.from(content.querySelectorAll('details[open]'), node => node.id);
          const scrollY = window.scrollY;
          content.innerHTML = next.getElementById('usage-content').innerHTML;
          for (const id of openIds) document.getElementById(id)?.setAttribute('open', '');
          refresh.disabled = refreshing || next.getElementById('refresh').disabled;
          if (activeId && activeId !== 'refresh' && activeId !== 'settings') {
            (document.getElementById(activeId) || refresh).focus({ preventScroll: true });
          }
          window.scrollTo(0, scrollY);
        }
        if (data.type === 'refreshComplete') {
          refreshing = false;
          refresh.disabled = data.disabled === true;
          refresh.textContent = 'Refresh';
          content.removeAttribute('aria-busy');
          if (restoreRefreshFocus && document.activeElement === document.body) refresh.focus({ preventScroll: true });
          restoreRefreshFocus = false;
          status.textContent = data.succeeded ? 'Enabled sources refreshed.' : 'Some sources could not refresh. Check their status below or copy diagnostics.';
        }
      });
      vscode.postMessage({ command: 'ready' });
    </script>
  </body>
</html>`;
}
