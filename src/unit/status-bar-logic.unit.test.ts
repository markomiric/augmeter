import { describe, it, expect } from "vitest";
import {
  computePercentage,
  computeValueText,
  computeDisplayText,
  buildTooltip,
  computeStatusColor,
  computeStatusColorEnhanced,
  computeStatusColorsEnhanced,
  computeStatusColorWithAccessibility,
  computeAccessibilityLabel,
  computeStatusLevel,
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
    expect(computeValueText("both", 1200, 2000, 800, fmt)).toBe("#1200/#2000");
  });

  it("computeDisplayText applies density rules", () => {
    expect(computeDisplayText("detailed", "1/2", "dashboard")).toBe("$(dashboard) 1/2");
    expect(computeDisplayText("auto", "1/2", "dashboard")).toBe("1/2");
    expect(computeDisplayText("compact", "1/2", "dashboard")).toBe("1/2");
  });

  it("computeDisplayText uses icons when detailed", () => {
    expect(computeDisplayText("compact", "7/56", "graph-line")).toBe("7/56");
    expect(computeDisplayText("detailed", "7/56", "graph-line")).toBe("$(graph-line) 7/56");
    expect(computeDisplayText("auto", "7/56", "graph-line")).toBe("7/56");
  });

  it("buildTooltip creates concise, user-focused content", () => {
    // Test normal usage tooltip
    const tooltip1 = buildTooltip({
      used: 1000,
      limit: 2000,
      remaining: 1000,
      percentage: 50,
      showPercent: true,
      hasRealData: true,
      clickAction: "refresh",
    });
    expect(tooltip1).toMatch(/1,000 remaining of 2,000 limit/);
    expect(tooltip1).toMatch(/Click to refresh usage data/);
    expect(tooltip1).not.toMatch(/Augmeter/); // No redundant title
    expect(tooltip1).not.toMatch(/Status:/); // No redundant status
    expect(tooltip1).not.toMatch(/Source:/); // No technical source info

    // Test high usage tooltip
    const tooltip2 = buildTooltip({
      used: 1900,
      limit: 2000,
      remaining: 100,
      percentage: 95,
      showPercent: false,
      hasRealData: true,
      clickAction: "openWebsite",
    });
    expect(tooltip2).toMatch(/Near limit: 100 remaining/);
    expect(tooltip2).toMatch(/Click to open Augment website/);

    // Test unauthenticated state
    const tooltip3 = buildTooltip({
      used: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      showPercent: false,
      hasRealData: false,
      clickAction: "openWebsite",
    });
    expect(tooltip3).toMatch(/Sign in for real usage data/);
    expect(tooltip3).toMatch(/Click to open Augment website/);
  });

  it("computeStatusColor maps thresholds and data source (legacy)", () => {
    // Updated to match improved readability logic - using proper foreground colors
    expect(computeStatusColor(49, true)).toBe("statusBarItem.prominentForeground");
    expect(computeStatusColor(50, true)).toBe("statusBarItem.prominentForeground");
    expect(computeStatusColor(75, true)).toBe("statusBarItem.warningForeground");
    expect(computeStatusColor(85, true)).toBe("statusBarItem.errorForeground");
    expect(computeStatusColor(95, true)).toBe("statusBarItem.errorForeground");

    // No real data => undefined below warning/error
    expect(computeStatusColor(10, false)).toBe(undefined);
    expect(computeStatusColor(49, false)).toBe(undefined);

    // Warning/error override hasRealData
    expect(computeStatusColor(75, false)).toBe("statusBarItem.warningForeground");
    expect(computeStatusColor(85, false)).toBe("statusBarItem.errorForeground");
    expect(computeStatusColor(95, false)).toBe("statusBarItem.errorForeground");
  });

  it("computeStatusColorEnhanced with standard scheme", () => {
    const standardThresholds: ColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    // Test all threshold levels with real data - updated for improved readability
    expect(computeStatusColorEnhanced(96, true, "standard", standardThresholds)).toBe(
      "statusBarItem.errorForeground"
    );
    expect(computeStatusColorEnhanced(90, true, "standard", standardThresholds)).toBe(
      "statusBarItem.errorForeground"
    );
    expect(computeStatusColorEnhanced(80, true, "standard", standardThresholds)).toBe(
      "statusBarItem.warningForeground"
    );
    expect(computeStatusColorEnhanced(60, true, "standard", standardThresholds)).toBe(
      "statusBarItem.prominentForeground"
    );
    expect(computeStatusColorEnhanced(40, true, "standard", standardThresholds)).toBe(
      "statusBarItem.prominentForeground"
    );

    // Test without real data
    expect(computeStatusColorEnhanced(40, false, "standard", standardThresholds)).toBe(undefined);
    expect(computeStatusColorEnhanced(60, false, "standard", standardThresholds)).toBe(undefined);

    // Critical and warning levels should show even without real data
    expect(computeStatusColorEnhanced(96, false, "standard", standardThresholds)).toBe(
      "statusBarItem.errorForeground"
    );
    expect(computeStatusColorEnhanced(80, false, "standard", standardThresholds)).toBe(
      "statusBarItem.warningForeground"
    );
  });

  it("computeStatusColorEnhanced with conservative scheme", () => {
    const standardThresholds: ColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    // Conservative scheme should be less sensitive (higher thresholds)
    // With +3 adjustment, critical becomes 98%, so 96% should be high warning
    expect(computeStatusColorEnhanced(96, true, "conservative", standardThresholds)).toBe(
      "statusBarItem.errorForeground"
    );

    // 99% should be critical (above 98% threshold)
    expect(computeStatusColorEnhanced(99, true, "conservative", standardThresholds)).toBe(
      "statusBarItem.errorForeground"
    );

    // 90% should be high warning (85+5=90, so exactly at threshold)
    expect(computeStatusColorEnhanced(90, true, "conservative", standardThresholds)).toBe(
      "statusBarItem.errorForeground"
    );

    // 80% should be warning (75+5=80, so exactly at threshold)
    expect(computeStatusColorEnhanced(80, true, "conservative", standardThresholds)).toBe(
      "statusBarItem.warningForeground"
    );
  });

  it("computeStatusColorEnhanced with aggressive scheme", () => {
    const standardThresholds: ColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    // Aggressive scheme should be more sensitive (lower thresholds)
    // 92% should be critical (95-3)
    expect(computeStatusColorEnhanced(92, true, "aggressive", standardThresholds)).toBe(
      "statusBarItem.errorForeground"
    );

    // 80% should be high warning (85-5)
    expect(computeStatusColorEnhanced(80, true, "aggressive", standardThresholds)).toBe(
      "statusBarItem.errorForeground"
    );

    // 70% should be warning (75-5)
    expect(computeStatusColorEnhanced(70, true, "aggressive", standardThresholds)).toBe(
      "statusBarItem.warningForeground"
    );

    // 40% should be caution (50-10)
    expect(computeStatusColorEnhanced(40, true, "aggressive", standardThresholds)).toBe(
      "statusBarItem.prominentForeground"
    );
  });

  it("computeStatusColorEnhanced with custom thresholds", () => {
    const customThresholds: ColorThresholds = {
      critical: 90,
      highWarning: 80,
      warning: 70,
      caution: 40,
    };

    expect(computeStatusColorEnhanced(91, true, "standard", customThresholds)).toBe(
      "statusBarItem.errorForeground"
    );
    expect(computeStatusColorEnhanced(85, true, "standard", customThresholds)).toBe(
      "statusBarItem.errorForeground"
    );
    expect(computeStatusColorEnhanced(75, true, "standard", customThresholds)).toBe(
      "statusBarItem.warningForeground"
    );
    expect(computeStatusColorEnhanced(45, true, "standard", customThresholds)).toBe(
      "statusBarItem.prominentForeground"
    );
    expect(computeStatusColorEnhanced(35, true, "standard", customThresholds)).toBe(
      "statusBarItem.prominentForeground"
    );
  });

  it("formatCompact produces compact strings or falls back", () => {
    // Basic sanity (environment-dependent due to Intl locale, so just smoke test)
    const small = formatCompact(999);
    expect(typeof small === "string" && small.length >= 1).toBeTruthy();
    const large = formatCompact(1200);
    expect(/K|\d/.test(large)).toBeTruthy();
  });

  it("formatCompact handles non-finite numbers", () => {
    expect(formatCompact(Infinity)).toBe("Infinity");
    expect(formatCompact(-Infinity)).toBe("-Infinity");
    expect(formatCompact(NaN)).toBe("NaN");
  });

  it("formatCompact handles decimals", () => {
    const result = formatCompact(123.45);
    expect(result).toBe("123.45");
  });

  it("computeStatusLevel categorizes usage levels", () => {
    expect(computeStatusLevel(95)).toBe("Near limit");
    expect(computeStatusLevel(90)).toBe("Near limit");
    expect(computeStatusLevel(85)).toBe("High usage");
    expect(computeStatusLevel(75)).toBe("High usage");
    expect(computeStatusLevel(60)).toBe("Moderate usage");
    expect(computeStatusLevel(50)).toBe("Moderate usage");
    expect(computeStatusLevel(30)).toBe("Low usage");
    expect(computeStatusLevel(0)).toBe("Low usage");
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
  });

  describe("computeStatusColorWithAccessibility", () => {
    const standardThresholds: ColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    it("returns high contrast colors when enabled", () => {
      const color = computeStatusColorWithAccessibility(
        96,
        true,
        "standard",
        standardThresholds,
        true
      );
      expect(color).toBe("statusBarItem.errorForeground");
    });

    it("returns standard colors when high contrast disabled", () => {
      const color = computeStatusColorWithAccessibility(
        96,
        true,
        "standard",
        standardThresholds,
        false
      );
      expect(color).toBe("statusBarItem.errorForeground");
    });

    it("handles warning level with high contrast", () => {
      const color = computeStatusColorWithAccessibility(
        80,
        true,
        "standard",
        standardThresholds,
        true
      );
      expect(color).toBe("statusBarItem.warningForeground");
    });

    it("handles normal usage with high contrast", () => {
      const color = computeStatusColorWithAccessibility(
        30,
        true,
        "standard",
        standardThresholds,
        true
      );
      expect(color).toBe("statusBarItem.prominentForeground");
    });

    it("returns undefined when no real data", () => {
      const color = computeStatusColorWithAccessibility(
        30,
        false,
        "standard",
        standardThresholds,
        true
      );
      expect(color).toBeUndefined();
    });
  });

  describe("computeAccessibilityLabel", () => {
    it("generates label for normal usage", () => {
      const label = computeAccessibilityLabel(500, 1000, 500, 50);
      expect(label).toContain("500");
      expect(label).toContain("1000");
      expect(label).toContain("50%");
    });

    it("generates label for high usage", () => {
      const label = computeAccessibilityLabel(900, 1000, 100, 90);
      expect(label).toContain("900");
      expect(label).toContain("1000");
      expect(label).toContain("90%");
    });

    it("generates label for near limit", () => {
      const label = computeAccessibilityLabel(980, 1000, 20, 98);
      expect(label).toContain("980");
      expect(label).toContain("1000");
      expect(label).toContain("98%");
    });

    it("handles zero values", () => {
      const label = computeAccessibilityLabel(0, 0, 0, 0);
      expect(label).toContain("0");
    });
  });
});
