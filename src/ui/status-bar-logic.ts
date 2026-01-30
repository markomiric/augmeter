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
  fmt: (n: number) => string = formatCompact
): string {
  const u = fmt(used);
  const l = fmt(limit);
  const r = fmt(remaining);

  // Gracefully handle unknown/zero limit: show used-only value in the bar
  if (limit <= 0) {
    return displayMode === "percentage" ? u : u;
  }

  switch (displayMode) {
    case "used":
      return `${u}/${l}`;
    case "remaining":
      return `${r}/${l}`;
    case "remainingOnly":
      return `${r}`;
    case "percentage":
      return `${computePercentage(used, limit)}%`;
    case "both":
    default:
      // Show used/limit in compact bar; details go to tooltip
      return `${u}/${l}`;
  }
}

export function computeDisplayText(
  density: Density,
  valueText: string,
  iconName: string = "dashboard"
): string {
  if (density === "detailed") {
    return `$(${iconName}) ${valueText}`;
  }
  return valueText;
}

export function computeStatusLevel(
  percentage: number
): "Near limit" | "High usage" | "Moderate usage" | "Low usage" {
  if (percentage >= 90) return "Near limit";
  if (percentage >= 75) return "High usage";
  if (percentage >= 50) return "Moderate usage";
  return "Low usage";
}

export function buildTooltip(params: {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  showPercent: boolean;
  hasRealData: boolean;
  clickAction: ClickAction;
  lastUpdated?: Date | undefined;
  subscriptionType?: string | undefined;
  renewalDate?: string | undefined;
}): string {
  const {
    remaining,
    limit,
    percentage,
    hasRealData,
    clickAction,
    lastUpdated,
    subscriptionType,
    renewalDate,
  } = params;

  // Build concise, action-focused tooltip content
  const lines: string[] = [];

  // Subscription type
  if (subscriptionType) {
    lines.push(`Plan: ${subscriptionType}`);
  }

  // Primary information: remaining usage (most actionable)
  if (limit > 0) {
    if (percentage >= 90) {
      lines.push(`Near limit: ${remaining.toLocaleString()} remaining`);
    } else if (percentage >= 75) {
      lines.push(`${remaining.toLocaleString()} remaining of ${limit.toLocaleString()}`);
    } else {
      lines.push(`${remaining.toLocaleString()} remaining of ${limit.toLocaleString()} limit`);
    }
  } else if (!hasRealData) {
    lines.push("Sign in for real usage data");
  } else {
    lines.push("Usage data available (limit unknown)");
  }

  // Renewal date
  if (renewalDate) {
    try {
      const date = new Date(renewalDate);
      if (!isNaN(date.getTime())) {
        lines.push(`Renews: ${date.toLocaleDateString()}`);
      }
    } catch {
      // Skip invalid dates
    }
  }

  // Last updated timestamp
  if (lastUpdated) {
    lines.push(`Updated: ${lastUpdated.toLocaleTimeString()}`);
  }

  // Action information: what clicking will do
  const clickLine =
    clickAction === "refresh"
      ? "Click to refresh usage data"
      : clickAction === "openWebsite"
        ? "Click to open Augment website"
        : "Click to open settings";

  lines.push(clickLine);

  return lines.join("\n");
}

export function buildUsageBar(percentage: number, width: number = 10): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `\`[${"■".repeat(filled)}${"·".repeat(empty)}]\` ${percentage}%`;
}

export function formatRateLine(ratePerHour: number | null | undefined): string | null {
  if (ratePerHour === null || ratePerHour === undefined) return null;
  if (ratePerHour === 0) return "**Rate:** No recent activity";
  return `**Rate:** ~${Math.round(ratePerHour).toLocaleString()}/hr`;
}

export function formatProjectionLine(projectedDays: number | null | undefined): string | null {
  if (projectedDays === null || projectedDays === undefined) return null;
  if (projectedDays === 0) return "**Projected:** Credits exhausted";
  if (projectedDays < 1) {
    const hours = Math.max(1, Math.round(projectedDays * 24));
    return `**Projected:** ~${hours}h remaining`;
  }
  return `**Projected:** ~${Math.round(projectedDays)} days remaining`;
}

export function buildMarkdownTooltip(params: {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  hasRealData: boolean;
  clickAction: ClickAction;
  lastUpdated?: Date | undefined;
  subscriptionType?: string | undefined;
  renewalDate?: string | undefined;
  usageRatePerHour?: number | null | undefined;
  projectedDaysRemaining?: number | null | undefined;
  sessionActivity?: { promptCount: number; sessionCount: number } | null | undefined;
}): string {
  const {
    used,
    remaining,
    limit,
    percentage,
    hasRealData,
    clickAction,
    lastUpdated,
    subscriptionType,
    renewalDate,
    usageRatePerHour,
    projectedDaysRemaining,
    sessionActivity,
  } = params;

  const lines: string[] = [];

  // Header
  if (subscriptionType) {
    lines.push(`**Augmeter** — ${subscriptionType}`);
  } else {
    lines.push("**Augmeter**");
  }

  lines.push("");

  if (!hasRealData) {
    lines.push("Sign in for real usage data");
  } else if (limit > 0) {
    // Usage bar visualization
    lines.push(buildUsageBar(percentage));
    lines.push("");

    // Usage details
    lines.push(`**Used:** ${used.toLocaleString()} / ${limit.toLocaleString()}`);
    lines.push(`**Remaining:** ${remaining.toLocaleString()}`);
  } else {
    lines.push(`**Used:** ${used.toLocaleString()}`);
  }

  // Rate and projection (only when we have real data)
  if (hasRealData) {
    const rateLine = formatRateLine(usageRatePerHour);
    if (rateLine) {
      lines.push(rateLine);
    }

    const projLine = formatProjectionLine(projectedDaysRemaining);
    if (projLine) {
      lines.push(projLine);
    }
  }

  // Session activity (experimental, behind config flag — only with real data)
  if (hasRealData && sessionActivity && sessionActivity.promptCount > 0) {
    lines.push(
      `**Today:** ${sessionActivity.promptCount} prompt${sessionActivity.promptCount !== 1 ? "s" : ""} across ${sessionActivity.sessionCount} session${sessionActivity.sessionCount !== 1 ? "s" : ""}`
    );
  }

  // Renewal date
  if (renewalDate) {
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
  const actionHint =
    clickAction === "refresh"
      ? "Click to refresh"
      : clickAction === "openWebsite"
        ? "Click to open website"
        : "Click to open settings";
  lines.push(actionHint);

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

// Return VS Code theme color id or undefined (legacy function for backward compatibility)
export function computeStatusColor(percentage: number, hasRealData: boolean): string | undefined {
  // Use standard thresholds for backward compatibility
  const standardThresholds: ColorThresholds = {
    critical: 95,
    highWarning: 85,
    warning: 75,
    caution: 50,
  };

  return computeStatusColorEnhanced(percentage, hasRealData, "standard", standardThresholds);
}

// Enhanced color computation with configurable thresholds and schemes
export function computeStatusColorEnhanced(
  percentage: number,
  hasRealData: boolean,
  colorScheme: ColorScheme,
  thresholds: ColorThresholds
): string | undefined {
  const colors = computeStatusColorsEnhanced(
    percentage,
    hasRealData,
    colorScheme,
    thresholds,
    false,
    false
  );
  return colors.foreground;
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

// Enhanced color computation with accessibility considerations
export function computeStatusColorWithAccessibility(
  percentage: number,
  hasRealData: boolean,
  colorScheme: ColorScheme,
  thresholds: ColorThresholds,
  highContrastMode: boolean = false
): string | undefined {
  // Apply color scheme adjustments to thresholds
  const adjustedThresholds = applyColorSchemeAdjustments(thresholds, colorScheme);

  // In high contrast mode, use more distinct colors
  if (highContrastMode) {
    const colors = computeHighContrastColors(percentage, hasRealData, adjustedThresholds, false);
    return colors.foreground;
  }

  // Critical usage - always show error regardless of data source
  if (percentage >= adjustedThresholds.critical) {
    return "statusBarItem.errorForeground";
  }

  // High warning - use distinct color that's readable
  if (percentage >= adjustedThresholds.highWarning) {
    // Use error foreground for high warning to ensure visibility
    return "statusBarItem.errorForeground";
  }

  // Warning - traditional warning color
  if (percentage >= adjustedThresholds.warning) {
    return "statusBarItem.warningForeground";
  }

  // Below warning threshold: keep default theme color to minimize noise
  return undefined;
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
  // - If we have real data, use prominent foreground to keep the item visually present
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

  // No real data - default
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
  return `Augmeter usage ${used} used of ${limit}. ${remaining} remaining. ${percentage}% of limit.`;
}
