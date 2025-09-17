import * as assert from "assert";
import {
  computePercentage,
  computeValueText,
  computeDisplayText,
  buildTooltip,
  computeStatusColor,
  computeStatusColorEnhanced,
  formatCompact,
  type ColorThresholds,
} from "../ui/status-bar-logic";

suite("StatusBar Logic (unit) Test Suite", () => {
  test("computePercentage handles zero/positive limits and rounds", () => {
    assert.strictEqual(computePercentage(0, 0), 0);
    assert.strictEqual(computePercentage(50, 0), 0);
    assert.strictEqual(computePercentage(50, 200), 25);
    assert.strictEqual(computePercentage(1, 3), 33);
  });

  test("computeValueText respects displayMode and uses formatter", () => {
    const fmt = (n: number) => `#${n}`; // deterministic
    assert.strictEqual(computeValueText("used", 1200, 2000, 800, fmt), "#1200/#2000");
    assert.strictEqual(computeValueText("remaining", 1200, 2000, 800, fmt), "#800/#2000");
    assert.strictEqual(computeValueText("both", 1200, 2000, 800, fmt), "#1200/#2000");
  });

  test("computeDisplayText applies density rules", () => {
    assert.strictEqual(computeDisplayText("detailed", "1/2", "dashboard"), "$(dashboard) 1/2");
    assert.strictEqual(computeDisplayText("auto", "1/2", "dashboard"), "1/2");
    assert.strictEqual(computeDisplayText("compact", "1/2", "dashboard"), "1/2");
  });

  test("computeDisplayText uses icons when detailed", () => {
    assert.strictEqual(computeDisplayText("compact", "7/56", "graph-line"), "7/56");
    assert.strictEqual(computeDisplayText("detailed", "7/56", "graph-line"), "$(graph-line) 7/56");
    assert.strictEqual(computeDisplayText("auto", "7/56", "graph-line"), "7/56");
  });

  test("buildTooltip creates concise, user-focused content", () => {
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
    assert.match(tooltip1, /1,000 remaining of 2,000 limit/);
    assert.match(tooltip1, /Click to refresh usage data/);
    assert.doesNotMatch(tooltip1, /Augmeter/); // No redundant title
    assert.doesNotMatch(tooltip1, /Status:/); // No redundant status
    assert.doesNotMatch(tooltip1, /Source:/); // No technical source info

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
    assert.match(tooltip2, /Near limit: 100 remaining/);
    assert.match(tooltip2, /Click to open Augment website/);

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
    assert.match(tooltip3, /Sign in for real usage data/);
    assert.match(tooltip3, /Click to open Augment website/);
  });

  test("computeStatusColor maps thresholds and data source (legacy)", () => {
    // Updated to match improved readability logic - using proper foreground colors
    assert.strictEqual(computeStatusColor(49, true), "statusBarItem.prominentForeground");
    assert.strictEqual(computeStatusColor(50, true), "statusBarItem.prominentForeground");
    assert.strictEqual(computeStatusColor(75, true), "statusBarItem.warningForeground");
    assert.strictEqual(computeStatusColor(85, true), "statusBarItem.errorForeground");
    assert.strictEqual(computeStatusColor(95, true), "statusBarItem.errorForeground");

    // No real data => undefined below warning/error
    assert.strictEqual(computeStatusColor(10, false), undefined);
    assert.strictEqual(computeStatusColor(49, false), undefined);

    // Warning/error override hasRealData
    assert.strictEqual(computeStatusColor(75, false), "statusBarItem.warningForeground");
    assert.strictEqual(computeStatusColor(85, false), "statusBarItem.errorForeground");
    assert.strictEqual(computeStatusColor(95, false), "statusBarItem.errorForeground");
  });

  test("computeStatusColorEnhanced with standard scheme", () => {
    const standardThresholds: ColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    // Test all threshold levels with real data - updated for improved readability
    assert.strictEqual(
      computeStatusColorEnhanced(96, true, "standard", standardThresholds),
      "statusBarItem.errorForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(90, true, "standard", standardThresholds),
      "statusBarItem.errorForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(80, true, "standard", standardThresholds),
      "statusBarItem.warningForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(60, true, "standard", standardThresholds),
      "statusBarItem.prominentForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(40, true, "standard", standardThresholds),
      "statusBarItem.prominentForeground"
    );

    // Test without real data
    assert.strictEqual(
      computeStatusColorEnhanced(40, false, "standard", standardThresholds),
      undefined
    );
    assert.strictEqual(
      computeStatusColorEnhanced(60, false, "standard", standardThresholds),
      undefined
    );

    // Critical and warning levels should show even without real data
    assert.strictEqual(
      computeStatusColorEnhanced(96, false, "standard", standardThresholds),
      "statusBarItem.errorForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(80, false, "standard", standardThresholds),
      "statusBarItem.warningForeground"
    );
  });

  test("computeStatusColorEnhanced with conservative scheme", () => {
    const standardThresholds: ColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    // Conservative scheme should be less sensitive (higher thresholds)
    // With +3 adjustment, critical becomes 98%, so 96% should be high warning
    assert.strictEqual(
      computeStatusColorEnhanced(96, true, "conservative", standardThresholds),
      "statusBarItem.errorForeground"
    );

    // 99% should be critical (above 98% threshold)
    assert.strictEqual(
      computeStatusColorEnhanced(99, true, "conservative", standardThresholds),
      "statusBarItem.errorForeground"
    );

    // 90% should be high warning (85+5=90, so exactly at threshold)
    assert.strictEqual(
      computeStatusColorEnhanced(90, true, "conservative", standardThresholds),
      "statusBarItem.errorForeground"
    );

    // 80% should be warning (75+5=80, so exactly at threshold)
    assert.strictEqual(
      computeStatusColorEnhanced(80, true, "conservative", standardThresholds),
      "statusBarItem.warningForeground"
    );
  });

  test("computeStatusColorEnhanced with aggressive scheme", () => {
    const standardThresholds: ColorThresholds = {
      critical: 95,
      highWarning: 85,
      warning: 75,
      caution: 50,
    };

    // Aggressive scheme should be more sensitive (lower thresholds)
    // 92% should be critical (95-3)
    assert.strictEqual(
      computeStatusColorEnhanced(92, true, "aggressive", standardThresholds),
      "statusBarItem.errorForeground"
    );

    // 80% should be high warning (85-5)
    assert.strictEqual(
      computeStatusColorEnhanced(80, true, "aggressive", standardThresholds),
      "statusBarItem.errorForeground"
    );

    // 70% should be warning (75-5)
    assert.strictEqual(
      computeStatusColorEnhanced(70, true, "aggressive", standardThresholds),
      "statusBarItem.warningForeground"
    );

    // 40% should be caution (50-10)
    assert.strictEqual(
      computeStatusColorEnhanced(40, true, "aggressive", standardThresholds),
      "statusBarItem.prominentForeground"
    );
  });

  test("computeStatusColorEnhanced with custom thresholds", () => {
    const customThresholds: ColorThresholds = {
      critical: 90,
      highWarning: 80,
      warning: 70,
      caution: 40,
    };

    assert.strictEqual(
      computeStatusColorEnhanced(91, true, "standard", customThresholds),
      "statusBarItem.errorForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(85, true, "standard", customThresholds),
      "statusBarItem.errorForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(75, true, "standard", customThresholds),
      "statusBarItem.warningForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(45, true, "standard", customThresholds),
      "statusBarItem.prominentForeground"
    );
    assert.strictEqual(
      computeStatusColorEnhanced(35, true, "standard", customThresholds),
      "statusBarItem.prominentForeground"
    );
  });

  test("formatCompact produces compact strings or falls back", () => {
    // Basic sanity (environment-dependent due to Intl locale, so just smoke test)
    const small = formatCompact(999);
    assert.ok(typeof small === "string" && small.length >= 1);
    const large = formatCompact(1200);
    assert.ok(/K|\d/.test(large));
  });
});
