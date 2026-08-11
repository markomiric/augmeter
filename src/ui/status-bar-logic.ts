import type { ProviderHealthSnapshot, ProviderUsageSnapshot } from "../core/types/provider-usage";
import {
  pluralize,
  providerDisplayName,
  providerHealthText,
  providerMetricNoun,
} from "../core/copy/provider-copy";

export type ClickAction = "refresh" | "openWebsite" | "openSettings";

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return `${n}`;
  return n.toLocaleString();
}

export function computePercentage(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((used / limit) * 100);
}

export function formatStatusValue(
  used: number,
  limit: number,
  remaining: number,
  fmt: (n: number) => string = formatCompact
): string {
  const u = fmt(used);
  const l = fmt(limit);
  const r = fmt(remaining);
  return limit > 0 ? `${u}/${l} · ${r} left` : u;
}

export function formatStatusText(valueText: string, label: string = "Augment"): string {
  const labeledValue = label ? `${label} · ${valueText}` : valueText;
  return valueText.length <= 12 ? `$(dashboard) ${labeledValue}` : labeledValue;
}

function buildUsageBar(percentage: number, width: number = 10): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `\`[${"■".repeat(filled)}${"·".repeat(empty)}]\` ${percentage}%`;
}

export function formatRateLine(ratePerHour: number | null | undefined): string | null {
  if (ratePerHour === null || ratePerHour === undefined) return null;
  if (ratePerHour === 0) return "**Pace:** No recent credit activity";
  return `**Pace:** about ${Math.round(ratePerHour).toLocaleString()} credits per hour`;
}

export function formatProjectionLine(projectedDays: number | null | undefined): string | null {
  if (projectedDays === null || projectedDays === undefined) return null;
  if (projectedDays === 0) return "**At this pace:** Credits exhausted";
  if (projectedDays < 1) {
    const hours = Math.max(1, Math.round(projectedDays * 24));
    return `**At this pace:** about ${hours} ${pluralize(hours, "hour")} left`;
  }
  const days = Math.max(1, Math.round(projectedDays));
  return `**At this pace:** about ${days} ${pluralize(days, "day")} left`;
}

export function formatTargetLine(
  monthlyTarget: number | null | undefined,
  targetDelta: number | null | undefined,
  targetProgressPercent: number | null | undefined
): string | null {
  if (!monthlyTarget || monthlyTarget <= 0 || targetDelta === null || targetDelta === undefined) {
    return null;
  }

  if (targetDelta >= 0) {
    const progress = targetProgressPercent ?? 0;
    return `**Cycle target:** ${progress}% used · ${Math.max(0, targetDelta).toLocaleString()} credits under target`;
  }

  return `**Cycle target:** ${Math.abs(targetDelta).toLocaleString()} credits over target`;
}

export function buildProviderUsageLines(
  snapshots: ProviderUsageSnapshot[],
  healthSnapshots: ProviderHealthSnapshot[]
): string[] {
  const providerIds = new Set<string>();
  const latestByWindow = new Map<string, ProviderUsageSnapshot>();
  for (const snapshot of snapshots) {
    if (snapshot.providerId === "augment" || snapshot.metricType !== "messages") {
      continue;
    }
    providerIds.add(snapshot.providerId);

    const key = `${snapshot.providerId}:${snapshot.windowType}:${snapshot.metricType}`;
    const existing = latestByWindow.get(key);
    if (
      !existing ||
      new Date(snapshot.timestamp).getTime() >= new Date(existing.timestamp).getTime()
    ) {
      latestByWindow.set(key, snapshot);
    }
  }

  const latestHealth = new Map<string, ProviderHealthSnapshot>();
  for (const snapshot of healthSnapshots) {
    if (snapshot.providerId === "augment") {
      continue;
    }
    providerIds.add(snapshot.providerId);
    const existing = latestHealth.get(snapshot.providerId);
    if (
      !existing ||
      new Date(snapshot.checkedAt).getTime() >= new Date(existing.checkedAt).getTime()
    ) {
      latestHealth.set(snapshot.providerId, snapshot);
    }
  }

  const preferredOrder = ["claude", "codex", "copilot"];
  const orderedProviderIds = Array.from(providerIds).sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a);
    const bIndex = preferredOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return orderedProviderIds
    .map(providerId => {
      const usageParts: string[] = [];
      const rolling = latestByWindow.get(`${providerId}:rolling_5h:messages`);
      const weekly = latestByWindow.get(`${providerId}:weekly_7d:messages`);
      const monthly = latestByWindow.get(`${providerId}:monthly:messages`);
      const cumulative = latestByWindow.get(`${providerId}:custom:messages`);
      const metricNoun = providerMetricNoun(providerId);

      if (typeof rolling?.used === "number" && Number.isFinite(rolling.used)) {
        const count = Math.round(rolling.used);
        usageParts.push(`${count.toLocaleString()} ${pluralize(count, metricNoun)} in 5 hours`);
      }
      if (typeof weekly?.used === "number" && Number.isFinite(weekly.used)) {
        const count = Math.round(weekly.used);
        usageParts.push(`${count.toLocaleString()} ${pluralize(count, metricNoun)} in 7 days`);
      }
      if (typeof monthly?.used === "number" && Number.isFinite(monthly.used)) {
        const count = Math.round(monthly.used);
        const label =
          providerId === "copilot" && monthly.sourceKind === "api"
            ? "premium requests reported by GitHub"
            : pluralize(count, metricNoun);
        usageParts.push(`${count.toLocaleString()} ${label} this month`);
      }
      if (typeof cumulative?.used === "number" && Number.isFinite(cumulative.used)) {
        const count = Math.round(cumulative.used);
        if (providerId === "copilot" && cumulative.sourceKind === "api") {
          usageParts.push(
            `${count.toLocaleString()} premium requests reported by GitHub this billing period`
          );
        } else {
          if (providerId === "copilot" && cumulative.sourceKind === "file") {
            usageParts.push(
              `${count.toLocaleString()} requests recorded by VS Code (no time range)`
            );
          } else {
            const local = cumulative.sourceKind === "file" ? "local " : "";
            usageParts.push(
              `${count.toLocaleString()} ${local}${pluralize(count, metricNoun)} recorded`
            );
          }
        }
      }

      if (usageParts.length === 0) {
        const health = latestHealth.get(providerId);
        if (!health) {
          return null;
        }
        usageParts.push(providerHealthText(health));
      }

      return `${providerDisplayName(providerId)}: ${usageParts.join(" • ")}`;
    })
    .filter((line): line is string => Boolean(line));
}

export function buildMarkdownTooltip(params: {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  hasRealData: boolean;
  usageKnown?: boolean | undefined;
  monthlyAllowance?: number | null | undefined;
  clickAction: ClickAction;
  lastUpdated?: Date | undefined;
  subscriptionType?: string | undefined;
  renewalDate?: string | undefined;
  usageRatePerHour?: number | null | undefined;
  projectedDaysRemaining?: number | null | undefined;
  monthlyTarget?: number | null | undefined;
  targetDelta?: number | null | undefined;
  targetProgressPercent?: number | null | undefined;
  projectedDepletionDate?: Date | null | undefined;
  providerUsageLines?: string[] | undefined;
}): string {
  const {
    used,
    remaining,
    limit,
    percentage,
    hasRealData,
    usageKnown = true,
    monthlyAllowance,
    clickAction,
    lastUpdated,
    subscriptionType,
    renewalDate,
    usageRatePerHour,
    projectedDaysRemaining,
    monthlyTarget,
    targetDelta,
    targetProgressPercent,
    projectedDepletionDate,
    providerUsageLines,
  } = params;

  const lines: string[] = [];

  lines.push("**Assistant usage**");

  if (providerUsageLines && providerUsageLines.length > 0) {
    lines.push(
      ["**Assistant activity:**", ...providerUsageLines.map(line => `- ${line}`)].join("\n")
    );
  }

  if (hasRealData) {
    lines.push("**Augment credits**");
    if (subscriptionType) {
      lines.push(`Plan: ${subscriptionType}`);
    }
  } else {
    lines.push("**Augment credits:** Not connected");
    lines.push("Run **Augmeter: Connect Augment** to include your credit balance and trends.");
  }

  lines.push("");

  if (hasRealData) {
    if (!usageKnown) {
      lines.push(`**Remaining:** ${remaining.toLocaleString()} credits left`);
      if (monthlyAllowance !== null && monthlyAllowance !== undefined) {
        lines.push(`**Monthly allowance:** ${monthlyAllowance.toLocaleString()} credits`);
      }
      lines.push("Auggie reports your balance but not what you've used this cycle.");
    } else if (limit > 0) {
      // Usage bar visualization
      lines.push(buildUsageBar(percentage));
      lines.push("");

      // Usage details
      lines.push(
        `**Used:** ${used.toLocaleString()} of ${limit.toLocaleString()} credits (${percentage}%)`
      );
      lines.push(`**Remaining:** ${remaining.toLocaleString()} credits left`);
    } else {
      lines.push(`**Used:** ${used.toLocaleString()} credits`);
    }
  }

  // Credit pace and projection are available only with Augment credit data.
  if (hasRealData && usageKnown) {
    const rateLine = formatRateLine(usageRatePerHour);
    if (rateLine) {
      lines.push(rateLine);
    }

    const projLine = formatProjectionLine(projectedDaysRemaining);
    if (projLine) {
      lines.push(projLine);
    }

    const targetLine = formatTargetLine(monthlyTarget, targetDelta, targetProgressPercent);
    if (targetLine) {
      lines.push(targetLine);
    }

    if (projectedDepletionDate) {
      lines.push(`**Estimated run-out:** ${projectedDepletionDate.toLocaleDateString()}`);
    }
  }

  // Renewal date
  if (hasRealData && renewalDate) {
    try {
      const date = new Date(renewalDate);
      if (!isNaN(date.getTime())) {
        lines.push(`**Renews:** ${date.toLocaleDateString()}`);
      }
    } catch {
      // Skip invalid dates
    }
  }

  // Last updated
  if (lastUpdated) {
    lines.push("");
    lines.push(`_Updated ${lastUpdated.toLocaleTimeString()}_`);
  }

  // Action hint
  lines.push("");
  const actionHint = !hasRealData
    ? "Click to open assistant usage"
    : clickAction === "refresh"
      ? "Click to refresh"
      : clickAction === "openWebsite"
        ? "Click to open the Augment website"
        : "Click to open settings";
  lines.push(`${actionHint} · [Open assistant usage](command:augmeter.openUsageDashboard)`);

  return lines.join("\n\n");
}

export interface StatusBarColors {
  foreground?: string;
}

export function computeStatusColors(percentage: number, hasRealData: boolean): StatusBarColors {
  if (percentage >= 95) {
    return { foreground: "statusBarItem.errorForeground" };
  }
  if (percentage >= 75) {
    return { foreground: "statusBarItem.warningForeground" };
  }
  return hasRealData ? { foreground: "statusBarItem.prominentForeground" } : {};
}

export function computeAccessibilityLabel(
  used: number,
  limit: number,
  remaining: number,
  percentage: number
): string {
  return `Augment credits: ${used} of ${limit} used, ${remaining} left, ${percentage} percent.`;
}
