import { describe, it, expect } from "vitest";
import {
  buildProviderUsageLines,
  computePercentage,
  formatStatusValue,
  formatStatusText,
  buildMarkdownTooltip,
  computeStatusColors,
  computeAccessibilityLabel,
  formatCompact,
} from "../ui/status-bar-logic";

describe("StatusBar Logic (unit) Test Suite", () => {
  it("computePercentage handles zero/positive limits and rounds", () => {
    expect(computePercentage(0, 0)).toBe(0);
    expect(computePercentage(50, 0)).toBe(0);
    expect(computePercentage(50, 200)).toBe(25);
    expect(computePercentage(1, 3)).toBe(33);
  });

  it("formats the fixed status value", () => {
    const fmt = (n: number) => `#${n}`;
    expect(formatStatusValue(1200, 2000, 800, fmt)).toBe("#1200/#2000 · #800 left");
    expect(formatStatusValue(1200, 0, 0, fmt)).toBe("#1200");
  });

  it("adds the fixed icon only when the value is short", () => {
    expect(formatStatusText("45 left")).toBe("$(dashboard) Augment · 45 left");
    expect(formatStatusText("1,200/2,000 · 800 left")).toBe("Augment · 1,200/2,000 · 800 left");
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
    expect(tooltip).toContain(
      "Run **Augmeter: Connect Augment** to include your credit balance and trends."
    );
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

    expect(lines).toEqual(["GitHub Copilot: 42 premium requests reported by GitHub this month"]);
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
      "GitHub Copilot: 42 premium requests reported by GitHub this billing period",
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
    expect(tooltip).toContain("Auggie reports your balance but not what you've used this cycle.");
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

  describe("computeStatusColors", () => {
    it("uses fixed native theme thresholds", () => {
      expect(computeStatusColors(96, true).foreground).toBe("statusBarItem.errorForeground");
      expect(computeStatusColors(80, true).foreground).toBe("statusBarItem.warningForeground");
      expect(computeStatusColors(60, true).foreground).toBe("statusBarItem.prominentForeground");
      expect(computeStatusColors(60, false).foreground).toBeUndefined();
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
