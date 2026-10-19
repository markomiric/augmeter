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
  getAugmentHealthMessage,
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
    expect(formatStatusValue(1200, 0, 0, fmt)).toBe("#1200 used");
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
      "Run **Augmeter: Connect Augment** to include your credit balance and metrics reported by the connected source."
    );
    expect(tooltip).toContain("**Assistant activity:**");
    expect(tooltip).toContain("Claude Code: 12 messages in 5 hours · 84 in 7 days");
    expect(tooltip).toContain("Click to open assistant usage");
    expect(tooltip).not.toContain("Click to connect Augment");
    expect(tooltip).not.toContain("real usage");
  });

  it("shows stale Augment health without hiding the last known balance", () => {
    const tooltip = buildMarkdownTooltip({
      used: 400,
      limit: 1000,
      remaining: 600,
      percentage: 40,
      hasRealData: true,
      clickAction: "refresh",
      augmentHealth: {
        providerId: "augment",
        status: "degraded",
        checkedAt: "2026-03-17T10:00:00.000Z",
        canCollectInCurrentWorkspace: true,
        message: "Augment credits couldn't be refreshed. Showing the last known data.",
      },
    });

    expect(tooltip).toContain("Augment credits couldn't be refreshed");
    expect(tooltip).toContain(
      `**Used:** ${(400).toLocaleString()} of ${(1000).toLocaleString()} credits (40%)`
    );
    expect(tooltip).toContain(`**Remaining:** ${(600).toLocaleString()} credits left`);
  });

  it("does not surface non-Augment health in the credit status", () => {
    expect(
      getAugmentHealthMessage({
        providerId: "claude",
        status: "degraded",
        checkedAt: "2026-03-17T10:00:00.000Z",
        canCollectInCurrentWorkspace: true,
        message: "Claude activity unavailable",
      })
    ).toBeNull();
  });

  it("labels the account action in the tooltip", () => {
    const tooltip = buildMarkdownTooltip({
      used: 400,
      limit: 1000,
      remaining: 600,
      percentage: 40,
      hasRealData: true,
      clickAction: "openWebsite",
    });

    expect(tooltip).toContain("Click to open the Augment account");
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

  it("buildProviderUsageLines labels Copilot AI Credits and legacy premium requests", () => {
    const copilotMonthly = (mode: string, used: number) => ({
      providerId: "copilot",
      timestamp: "2026-03-17T10:00:00.000Z",
      windowType: "monthly" as const,
      metricType: "messages" as const,
      sourceKind: "api" as const,
      used,
      details: { mode },
    });

    expect(buildProviderUsageLines([copilotMonthly("ai_credits", 1500)], [])).toEqual([
      "GitHub Copilot: 1,500 AI Credits used this month",
    ]);
    expect(buildProviderUsageLines([copilotMonthly("premium_requests", 42)], [])).toEqual([
      "GitHub Copilot: 42 premium requests this month",
    ]);
    expect(buildProviderUsageLines([copilotMonthly("ai_credits", 0)], [])).toEqual([
      "GitHub Copilot: 0 AI Credits used this month",
    ]);
    expect(buildProviderUsageLines([copilotMonthly("ai_credits", 150.5)], [])).toEqual([
      "GitHub Copilot: 150.5 AI Credits used this month",
    ]);
    expect(buildProviderUsageLines([copilotMonthly("ai_credits", 0.4)], [])).toEqual([
      "GitHub Copilot: 0.4 AI Credits used this month",
    ]);
    expect(buildProviderUsageLines([copilotMonthly("ai_credits", 1)], [])).toEqual([
      "GitHub Copilot: 1 AI Credit used this month",
    ]);
    expect(buildProviderUsageLines([copilotMonthly("ai_credits", 2.456)], [])).toEqual([
      "GitHub Copilot: 2.46 AI Credits used this month",
    ]);
  });

  it("shows the specific Copilot setup message in the tooltip when there is no Copilot data", () => {
    const checkedAt = "2026-03-17T10:00:00.000Z";
    const notConfigured =
      "VS Code no longer records local Copilot request counts. Turn on augmeter.providers.copilot.api.enabled to read your AI Credits from GitHub.";
    const lines = buildProviderUsageLines(
      [],
      [
        {
          providerId: "copilot",
          status: "unavailable",
          checkedAt,
          canCollectInCurrentWorkspace: true,
          errorCode: "COPILOT_API_NOT_CONFIGURED",
          message: notConfigured,
        },
      ]
    );
    expect(lines).toEqual([`GitHub Copilot: ${notConfigured}`]);

    const tooltip = buildMarkdownTooltip({
      used: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      hasRealData: false,
      clickAction: "refresh",
      providerUsageLines: lines,
    });
    expect(tooltip).toContain(`- GitHub Copilot: ${notConfigured}`);
    expect(tooltip).not.toContain("requests recorded by VS Code");

    const noBilling =
      "GitHub returned no personal Copilot billing data (HTTP 404); this API covers Copilot plans you pay for yourself.";
    expect(
      buildProviderUsageLines(
        [],
        [
          {
            providerId: "copilot",
            status: "degraded",
            checkedAt,
            canCollectInCurrentWorkspace: true,
            errorCode: "COPILOT_API_NO_BILLING_DATA",
            message: noBilling,
          },
        ]
      )
    ).toEqual([`GitHub Copilot: ${noBilling}`]);
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
      ]
    );

    expect(lines).toEqual([
      "Claude Code: no activity recorded yet",
      "Codex: no activity recorded yet",
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

    it("does not invent a limit, remaining value, or percentage for usage-only data", () => {
      const label = computeAccessibilityLabel(1200, 0, 0, 0);

      expect(label).toBe("Augment credits: 1,200 used; cycle limit unavailable.");
      expect(label).not.toContain("of 0");
      expect(label).not.toContain("left");
      expect(label).not.toContain("percent");
    });
  });
});
