import { describe, it, expect } from "vitest";
import {
  buildProviderUsageLines,
  computePercentage,
  computeValueText,
  computeDisplayText,
  buildMarkdownTooltip,
  computeStatusColorsEnhanced,
  computeAccessibilityLabel,
  formatCompact,
  type ColorThresholds,
} from "../ui/status-bar-logic";

describe("StatusBar Logic (unit) Test Suite", () => {
  it("computePercentage handles zero/positive limits and rounds", () => {
    expect(computePercentage(0, 0)).toBe(0);
    expect(computePercentage(50, 0)).toBe(0);
    expect(computePercentage(50, 200)).toBe(25);
    expect(computePercentage(1, 3)).toBe(33);
  });

  it("computeValueText respects displayMode and uses formatter", () => {
    const fmt = (n: number) => `#${n}`; // deterministic
    expect(computeValueText("used", 1200, 2000, 800, fmt)).toBe("#1200/#2000");
    expect(computeValueText("remaining", 1200, 2000, 800, fmt)).toBe("#800/#2000");
    expect(computeValueText("both", 1200, 2000, 800, fmt)).toBe("#1200/#2000 · #800 left");
    expect(computeValueText("used", 1200, 2000, 800, fmt, true)).toBe("#1200/#2000 (60%)");
  });

  it("computeDisplayText applies density rules", () => {
    expect(computeDisplayText("detailed", "1/2", "dashboard")).toBe("$(dashboard) 1/2");
    expect(computeDisplayText("auto", "1/2", "dashboard")).toBe("$(dashboard) 1/2");
    expect(computeDisplayText("compact", "1/2", "dashboard")).toBe("1/2");
  });

  it("computeDisplayText uses icons when detailed", () => {
    expect(computeDisplayText("compact", "7/56", "graph-line")).toBe("7/56");
    expect(computeDisplayText("detailed", "7/56", "graph-line")).toBe("$(graph-line) 7/56");
    expect(computeDisplayText("auto", "7/56", "graph-line")).toBe("$(graph-line) 7/56");
    expect(computeDisplayText("auto", "1,200/2,000 · 800 left", "graph-line")).toBe(
      "1,200/2,000 · 800 left"
    );
  });

  it("computeDisplayText identifies Augment without changing compact mode", () => {
    expect(computeDisplayText("detailed", "45 left", "dashboard", "Augment")).toBe(
      "$(dashboard) Augment · 45 left"
    );
    expect(computeDisplayText("auto", "1,200/2,000 · 800 left", "dashboard", "Augment")).toBe(
      "Augment · 1,200/2,000 · 800 left"
    );
    expect(computeDisplayText("compact", "45 left", "dashboard", "Augment")).toBe("45 left");
  });

  it("buildMarkdownTooltip includes provider usage lines", () => {
    const tooltip = buildMarkdownTooltip({
      used: 1000,
      limit: 2000,
      remaining: 1000,
      percentage: 50,
      hasRealData: true,
      clickAction: "refresh",
      providerUsageLines: ["Claude Code: 5h 12 • 7d 84", "Codex (local prompts): 5h 8 • 7d 42"],
    });

    expect(tooltip).toContain("**Assistant activity:**");
    expect(tooltip).toContain("- Claude Code: 5h 12 • 7d 84");
    expect(tooltip).toContain("- Codex (local prompts): 5h 8 • 7d 42");
    expect(tooltip).toContain("**Assistant usage**");
    expect(tooltip.indexOf("**Assistant activity:**")).toBeLessThan(
      tooltip.indexOf("**Augment credits**")
    );
    expect(tooltip).toContain("[Open assistant usage](command:augmeter.openUsageDashboard)");
  });

  it("buildMarkdownTooltip keeps local assistant activity visible without Augment credits", () => {
    const tooltip = buildMarkdownTooltip({
      used: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      hasRealData: false,
      clickAction: "refresh",
      providerUsageLines: ["Claude Code: 12 messages in 5 hours · 84 in 7 days"],
    });

    expect(tooltip).toContain("**Assistant usage**");
    expect(tooltip).toContain("**Augment credits:** Not connected");
    expect(tooltip).toContain("Run **Augmeter: Connect Augment** to add live credit data.");
    expect(tooltip).toContain("**Assistant activity:**");
    expect(tooltip).toContain("Claude Code: 12 messages in 5 hours · 84 in 7 days");
    expect(tooltip).toContain("Click to open assistant usage");
    expect(tooltip).not.toContain("Click to connect Augment");
    expect(tooltip).not.toContain("real usage");
  });

  it("buildProviderUsageLines orders providers and falls back to health status", () => {
    const lines = buildProviderUsageLines(
      [
        {
          providerId: "codex",
          timestamp: "2026-03-17T10:00:00.000Z",
          windowType: "rolling_5h",
          metricType: "messages",
          sourceKind: "file",
          used: 8,
        },
        {
          providerId: "claude",
          timestamp: "2026-03-17T10:00:00.000Z",
          windowType: "weekly_7d",
          metricType: "messages",
          sourceKind: "file",
          used: 84,
        },
      ],
      [
        {
          providerId: "copilot",
          status: "degraded",
          checkedAt: "2026-03-17T10:00:00.000Z",
          canCollectInCurrentWorkspace: true,
        },
      ]
    );

    expect(lines).toEqual([
      "Claude Code: 84 turns in 7 days",
      "Codex: 8 turns in 5 hours",
      "GitHub Copilot: activity unavailable; check Output > Augmeter",
    ]);
  });

  it("buildProviderUsageLines surfaces monthly provider snapshots", () => {
    const lines = buildProviderUsageLines(
      [
        {
          providerId: "copilot",
          timestamp: "2026-03-17T10:00:00.000Z",
          windowType: "monthly",
          metricType: "messages",
          sourceKind: "api",
          used: 42,
        },
      ],
      []
    );

    expect(lines).toEqual(["GitHub Copilot: 42 official premium requests this month"]);
  });

  it("treats missing activity history as an empty state", () => {
    const checkedAt = "2026-03-17T10:00:00.000Z";
    const lines = buildProviderUsageLines(
      [],
      [
        {
          providerId: "claude",
          status: "degraded",
          checkedAt,
          canCollectInCurrentWorkspace: true,
          errorCode: "CLAUDE_NO_LOGS",
        },
        {
          providerId: "codex",
          status: "degraded",
          checkedAt,
          canCollectInCurrentWorkspace: true,
          errorCode: "CODEX_NO_LOGS",
        },
        {
          providerId: "copilot",
          status: "degraded",
          checkedAt,
          canCollectInCurrentWorkspace: true,
          errorCode: "COPILOT_COUNTERS_MISSING",
        },
      ]
    );

    expect(lines).toEqual([
      "Claude Code: no activity recorded yet",
      "Codex: no activity recorded yet",
      "GitHub Copilot: no activity recorded yet",
    ]);
  });

  it("labels custom-window Copilot API data as official", () => {
    const lines = buildProviderUsageLines(
      [
        {
          providerId: "copilot",
          timestamp: "2026-03-17T10:00:00.000Z",
          windowType: "custom",
          metricType: "messages",
          sourceKind: "api",
          used: 42,
        },
      ],
      []
    );

    expect(lines).toEqual([
      "GitHub Copilot: 42 official premium requests in the current billing window",
    ]);
  });

  it("shows balance-only Augment data without inventing cycle usage", () => {
    const tooltip = buildMarkdownTooltip({
      used: 0,
      limit: 57306,
      remaining: 57306,
      percentage: 0,
      hasRealData: true,
      usageKnown: false,
      monthlyAllowance: 40000,
      clickAction: "refresh",
      usageRatePerHour: 0,
    });

    expect(tooltip).toContain("**Remaining:** 57,306 credits left");
    expect(tooltip).toContain("**Monthly allowance:** 40,000 credits");
    expect(tooltip).toContain("Cycle usage unavailable from Auggie CLI");
    expect(tooltip).not.toContain("**Used:**");
    expect(tooltip).not.toContain("**Pace:**");
    expect(tooltip).not.toContain("`[");
  });

  it("formatCompact adds locale separators for large numbers", () => {
    const large = formatCompact(275206);
    // toLocaleString output is environment-dependent, but should contain a separator
    expect(large).toMatch(/275.206/); // comma, period, or other separator
  });

  it("formatCompact leaves small numbers as-is", () => {
    expect(formatCompact(999)).toBe("999");
  });

  it("formatCompact handles non-finite numbers", () => {
    expect(formatCompact(Infinity)).toBe("Infinity");
    expect(formatCompact(-Infinity)).toBe("-Infinity");
    expect(formatCompact(NaN)).toBe("NaN");
  });

  it("formatCompact handles decimals", () => {
    const result = formatCompact(123.45);
    expect(result).toContain("123");
    expect(result).toContain("45");
  });

  describe("computeStatusColorsEnhanced", () => {
    const standardThresholds: ColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    it("returns foreground and background for enhanced readability mode", () => {
      const colors = computeStatusColorsEnhanced(96, true, "standard", standardThresholds, true);
      expect(colors.foreground).toBe("statusBarItem.errorForeground");
      expect(colors.background).toBe("statusBarItem.errorBackground");
    });

    it("returns only foreground for standard mode", () => {
      const colors = computeStatusColorsEnhanced(96, true, "standard", standardThresholds, false);
      expect(colors.foreground).toBe("statusBarItem.errorForeground");
      expect(colors.background).toBeUndefined();
    });

    it("handles warning level with enhanced readability", () => {
      const colors = computeStatusColorsEnhanced(80, true, "standard", standardThresholds, true);
      expect(colors.foreground).toBe("statusBarItem.warningForeground");
      expect(colors.background).toBe("statusBarItem.warningBackground");
    });

    it("handles caution level with enhanced readability", () => {
      const colors = computeStatusColorsEnhanced(60, true, "standard", standardThresholds, true);
      expect(colors.foreground).toBe("statusBarItem.prominentForeground");
      expect(colors.background).toBe("statusBarItem.prominentBackground");
    });

    it("handles normal usage with enhanced readability", () => {
      const colors = computeStatusColorsEnhanced(30, true, "standard", standardThresholds, true);
      expect(colors.foreground).toBe("statusBarItem.prominentForeground");
      expect(colors.background).toBeUndefined();
    });

    it("returns empty object when no real data", () => {
      const colors = computeStatusColorsEnhanced(30, false, "standard", standardThresholds, true);
      expect(colors).toEqual({});
    });

    it("maps standard-scheme thresholds in foreground-only mode", () => {
      const fg = (percentage: number, hasRealData: boolean) =>
        computeStatusColorsEnhanced(percentage, hasRealData, "standard", standardThresholds)
          .foreground;

      expect(fg(96, true)).toBe("statusBarItem.errorForeground");
      expect(fg(90, true)).toBe("statusBarItem.errorForeground");
      expect(fg(80, true)).toBe("statusBarItem.warningForeground");
      expect(fg(60, true)).toBe("statusBarItem.prominentForeground");
      expect(fg(40, true)).toBe("statusBarItem.prominentForeground");

      // No real data => default theme color below warning
      expect(fg(40, false)).toBeUndefined();
      expect(fg(60, false)).toBeUndefined();

      // Critical and warning levels show even without real data
      expect(fg(96, false)).toBe("statusBarItem.errorForeground");
      expect(fg(80, false)).toBe("statusBarItem.warningForeground");
    });

    it("applies conservative scheme threshold adjustments", () => {
      const fg = (percentage: number) =>
        computeStatusColorsEnhanced(percentage, true, "conservative", standardThresholds)
          .foreground;

      // critical 95+3=98, highWarning 85+5=90, warning 75+5=80
      expect(fg(99)).toBe("statusBarItem.errorForeground");
      expect(fg(96)).toBe("statusBarItem.errorForeground");
      expect(fg(90)).toBe("statusBarItem.errorForeground");
      expect(fg(80)).toBe("statusBarItem.warningForeground");
      expect(fg(79)).toBe("statusBarItem.prominentForeground");
    });

    it("applies aggressive scheme threshold adjustments", () => {
      const fg = (percentage: number) =>
        computeStatusColorsEnhanced(percentage, true, "aggressive", standardThresholds).foreground;

      // critical 95-3=92, highWarning 85-5=80, warning 75-5=70
      expect(fg(92)).toBe("statusBarItem.errorForeground");
      expect(fg(80)).toBe("statusBarItem.errorForeground");
      expect(fg(70)).toBe("statusBarItem.warningForeground");
      expect(fg(40)).toBe("statusBarItem.prominentForeground");
    });

    it("honors custom thresholds", () => {
      const customThresholds: ColorThresholds = {
        critical: 90,
        highWarning: 80,
        warning: 70,
        caution: 40,
      };
      const fg = (percentage: number) =>
        computeStatusColorsEnhanced(percentage, true, "standard", customThresholds).foreground;

      expect(fg(91)).toBe("statusBarItem.errorForeground");
      expect(fg(85)).toBe("statusBarItem.errorForeground");
      expect(fg(75)).toBe("statusBarItem.warningForeground");
      expect(fg(45)).toBe("statusBarItem.prominentForeground");
      expect(fg(35)).toBe("statusBarItem.prominentForeground");
    });

    it("uses distinct colors in high contrast mode", () => {
      const fg = (percentage: number, hasRealData: boolean) =>
        computeStatusColorsEnhanced(
          percentage,
          hasRealData,
          "standard",
          standardThresholds,
          false,
          true
        ).foreground;

      expect(fg(96, true)).toBe("statusBarItem.errorForeground");
      expect(fg(80, true)).toBe("statusBarItem.warningForeground");
      expect(fg(30, true)).toBe("statusBarItem.prominentForeground");
      expect(fg(30, false)).toBeUndefined();
    });

    it("pairs high contrast foregrounds with backgrounds in enhanced readability mode", () => {
      const colors = computeStatusColorsEnhanced(
        96,
        true,
        "standard",
        standardThresholds,
        true,
        true
      );
      expect(colors.foreground).toBe("statusBarItem.errorForeground");
      expect(colors.background).toBe("statusBarItem.errorBackground");
    });
  });

  describe("computeAccessibilityLabel", () => {
    it("generates label for normal usage", () => {
      const label = computeAccessibilityLabel(500, 1000, 500, 50);
      expect(label).toBe("Augment credits: 500 of 1000 used, 500 left, 50 percent.");
    });

    it("generates label for high usage", () => {
      const label = computeAccessibilityLabel(900, 1000, 100, 90);
      expect(label).toContain("900");
      expect(label).toContain("1000");
      expect(label).toContain("90 percent");
    });

    it("generates label for near limit", () => {
      const label = computeAccessibilityLabel(980, 1000, 20, 98);
      expect(label).toContain("980");
      expect(label).toContain("1000");
      expect(label).toContain("98 percent");
    });

    it("handles zero values", () => {
      const label = computeAccessibilityLabel(0, 0, 0, 0);
      expect(label).toContain("0");
    });
  });
});
