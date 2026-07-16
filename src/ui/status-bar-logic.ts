import type { ProviderHealthSnapshot, ProviderUsageSnapshot } from "../core/types/provider-usage";
import {
  pluralize,
  providerDisplayName,
  providerHealthText,
  providerMetricNoun,
} from "../core/copy/provider-copy";

export type DisplayMode = "used" | "remaining" | "remainingOnly" | "both" | "percentage";
export type Density = "auto" | "compact" | "detailed";
export type ClickAction = "refresh" | "openWebsite" | "openSettings";

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return `${n}`;
  return n.toLocaleString();
}

export function computePercentage(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((used / limit) * 100);
}

export function computeValueText(
  displayMode: DisplayMode,
  used: number,
  limit: number,
  remaining: number,
  fmt: (n: number) => string = formatCompact,
  showPercent: boolean = false
): string {
  const u = fmt(used);
  const l = fmt(limit);
  const r = fmt(remaining);

  // Gracefully handle unknown/zero limit: show used-only value in the bar
  if (limit <= 0) {
    return displayMode === "percentage" ? u : u;
  }

  let valueText: string;
  switch (displayMode) {
    case "used":
      valueText = `${u}/${l}`;
      break;
    case "remaining":
      valueText = `${r}/${l}`;
      break;
    case "remainingOnly":
      valueText = r;
      break;
    case "percentage":
      return `${computePercentage(used, limit)}%`;
    case "both":
      valueText = `${u}/${l} · ${r} left`;
      break;
    default:
      valueText = `${u}/${l}`;
      break;
  }

  return showPercent ? `${valueText} (${computePercentage(used, limit)}%)` : valueText;
}

export function computeDisplayText(
  density: Density,
  valueText: string,
  iconName: string = "dashboard",
  label: string = ""
): string {
  if (density === "compact") {
    return valueText;
  }
  const labeledValue = label ? `${label} · ${valueText}` : valueText;
  const shouldShowIcon = density === "detailed" || (density === "auto" && valueText.length <= 12);
  if (shouldShowIcon) {
    return `$(${iconName}) ${labeledValue}`;
  }
  return labeledValue;
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
            ? "official premium requests"
            : pluralize(count, metricNoun);
        usageParts.push(`${count.toLocaleString()} ${label} this month`);
      }
      if (typeof cumulative?.used === "number" && Number.isFinite(cumulative.used)) {
        const count = Math.round(cumulative.used);
        if (providerId === "copilot" && cumulative.sourceKind === "api") {
          usageParts.push(
            `${count.toLocaleString()} official premium requests in the current billing window`
          );
        } else {
          if (providerId === "copilot" && cumulative.sourceKind === "file") {
            usageParts.push(
              `${count.toLocaleString()} cumulative requests • time window unavailable`
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
  sessionActivity?: { promptCount: number; sessionCount: number } | null | undefined;
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
    sessionActivity,
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
    lines.push("Run **Augmeter: Connect Augment** to add live credit data.");
  }

  lines.push("");

  if (hasRealData) {
    if (!usageKnown) {
      lines.push(`**Remaining:** ${remaining.toLocaleString()} credits left`);
      if (monthlyAllowance !== null && monthlyAllowance !== undefined) {
        lines.push(`**Monthly allowance:** ${monthlyAllowance.toLocaleString()} credits`);
      }
      lines.push("Cycle usage unavailable from Auggie CLI balance data.");
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

  // Augment session activity is experimental and requires connected credit data.
  if (hasRealData && sessionActivity && sessionActivity.promptCount > 0) {
    lines.push(
      `**Today:** ${sessionActivity.promptCount} prompt${sessionActivity.promptCount !== 1 ? "s" : ""} across ${sessionActivity.sessionCount} session${sessionActivity.sessionCount !== 1 ? "s" : ""}`
    );
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

// Color scheme configuration type
export type ColorScheme = "standard" | "conservative" | "aggressive";

export interface ColorThresholds {
  critical: number;
  highWarning: number;
  warning: number;
  caution: number;
}

export interface StatusBarColors {
  foreground?: string;
  background?: string;
}

// Comprehensive color computation that returns both foreground and background colors
export function computeStatusColorsEnhanced(
  percentage: number,
  hasRealData: boolean,
  colorScheme: ColorScheme,
  thresholds: ColorThresholds,
  enhancedReadability: boolean = false,
  highContrastMode: boolean = false
): StatusBarColors {
  // Apply color scheme adjustments to thresholds
  const adjustedThresholds = applyColorSchemeAdjustments(thresholds, colorScheme);

  // In high contrast mode, use more distinct colors
  if (highContrastMode) {
    return computeHighContrastColors(
      percentage,
      hasRealData,
      adjustedThresholds,
      enhancedReadability
    );
  }

  // Enhanced readability mode uses background colors for better visibility
  if (enhancedReadability) {
    return computeEnhancedReadabilityColors(percentage, hasRealData, adjustedThresholds);
  }

  // Standard color computation
  return computeStandardColors(percentage, hasRealData, adjustedThresholds);
}

// Standard color computation (foreground only)
function computeStandardColors(
  percentage: number,
  hasRealData: boolean,
  thresholds: ColorThresholds
): StatusBarColors {
  // Critical usage - always show error regardless of data source
  if (percentage >= thresholds.critical) {
    return { foreground: "statusBarItem.errorForeground" };
  }

  // High warning - use distinct color that's readable
  if (percentage >= thresholds.highWarning) {
    return { foreground: "statusBarItem.errorForeground" };
  }

  // Warning - traditional warning color
  if (percentage >= thresholds.warning) {
    return { foreground: "statusBarItem.warningForeground" };
  }

  // Below warning threshold:
  // - If we have Augment credit data, keep the item visually present.
  // - If not, keep default theme color (undefined) to minimize noise
  if (hasRealData) {
    return { foreground: "statusBarItem.prominentForeground" };
  }
  return {};
}

// Enhanced readability colors (with background highlighting)
function computeEnhancedReadabilityColors(
  percentage: number,
  hasRealData: boolean,
  thresholds: ColorThresholds
): StatusBarColors {
  // Critical usage - high contrast red with background
  if (percentage >= thresholds.critical) {
    return {
      foreground: "statusBarItem.errorForeground",
      background: "statusBarItem.errorBackground",
    };
  }

  // High warning - error colors for visibility
  if (percentage >= thresholds.highWarning) {
    return {
      foreground: "statusBarItem.errorForeground",
      background: "statusBarItem.errorBackground",
    };
  }

  // Warning - warning colors with background
  if (percentage >= thresholds.warning) {
    return {
      foreground: "statusBarItem.warningForeground",
      background: "statusBarItem.warningBackground",
    };
  }

  // Caution - prominent colors for visibility
  if (percentage >= thresholds.caution && hasRealData) {
    return {
      foreground: "statusBarItem.prominentForeground",
      background: "statusBarItem.prominentBackground",
    };
  }

  // Normal usage - prominent colors
  if (hasRealData) {
    return { foreground: "statusBarItem.prominentForeground" };
  }

  // No Augment credit data.
  return {};
}

// High contrast color computation for accessibility
function computeHighContrastColors(
  percentage: number,
  hasRealData: boolean,
  thresholds: ColorThresholds,
  useBackground: boolean = false
): StatusBarColors {
  // In high contrast mode, use only the most distinct colors
  if (percentage >= thresholds.critical) {
    return useBackground
      ? { foreground: "statusBarItem.errorForeground", background: "statusBarItem.errorBackground" }
      : { foreground: "statusBarItem.errorForeground" };
  }

  if (percentage >= thresholds.warning) {
    return useBackground
      ? {
          foreground: "statusBarItem.warningForeground",
          background: "statusBarItem.warningBackground",
        }
      : { foreground: "statusBarItem.warningForeground" };
  }

  if (hasRealData) {
    return useBackground
      ? {
          foreground: "statusBarItem.prominentForeground",
          background: "statusBarItem.prominentBackground",
        }
      : { foreground: "statusBarItem.prominentForeground" };
  }

  return {};
}

// Apply color scheme adjustments to thresholds
function applyColorSchemeAdjustments(
  thresholds: ColorThresholds,
  colorScheme: ColorScheme
): ColorThresholds {
  switch (colorScheme) {
    case "conservative":
      // Conservative: higher thresholds, less sensitive
      return {
        critical: Math.min(100, thresholds.critical + 3),
        highWarning: Math.min(thresholds.critical - 1, thresholds.highWarning + 5),
        warning: Math.min(thresholds.highWarning - 1, thresholds.warning + 5),
        caution: Math.min(thresholds.warning - 1, thresholds.caution + 10),
      };

    case "aggressive":
      // Aggressive: lower thresholds, more sensitive
      return {
        critical: Math.max(80, thresholds.critical - 3),
        highWarning: Math.max(70, thresholds.highWarning - 5),
        warning: Math.max(50, thresholds.warning - 5),
        caution: Math.max(25, thresholds.caution - 10),
      };

    case "standard":
    default:
      // Standard: use thresholds as-is
      return thresholds;
  }
}

export function computeAccessibilityLabel(
  used: number,
  limit: number,
  remaining: number,
  percentage: number
): string {
  return `Augment credits: ${used} of ${limit} used, ${remaining} left, ${percentage} percent.`;
}
