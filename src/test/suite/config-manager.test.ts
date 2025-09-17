import * as assert from "assert";
import * as vscode from "vscode";
import { ConfigManager } from "../../core/config/config-manager";

suite("ConfigManager Test Suite", () => {
  let configManager: ConfigManager;

  setup(() => {
    configManager = new ConfigManager();
  });

  test("Should have correct default values matching package.json", () => {
    // Test that defaults match package.json configuration (or return reasonable values in test environment)
    assert.ok(typeof configManager.isEnabled() === "boolean", "isEnabled should return boolean");
    assert.strictEqual(
      configManager.getRefreshInterval(),
      60,
      "Default refresh interval should be 60"
    );
    assert.ok(
      typeof configManager.shouldShowInStatusBar() === "boolean",
      "shouldShowInStatusBar should return boolean"
    );
    assert.strictEqual(
      configManager.getClickAction(),
      "refresh",
      "Default clickAction should be 'refresh'"
    );
    assert.ok(
      typeof configManager.isAnalyticsEnabled() === "boolean",
      "isAnalyticsEnabled should return boolean"
    );
    assert.strictEqual(
      configManager.getDisplayMode(),
      "both",
      "Default displayMode should be 'both'"
    );
    assert.strictEqual(
      configManager.getStatusBarDensity(),
      "auto",
      "Default statusBarDensity should be 'auto'"
    );
    assert.ok(
      typeof configManager.shouldShowPercentInStatusBar() === "boolean",
      "shouldShowPercentInStatusBar should return boolean"
    );
    assert.strictEqual(
      configManager.shouldShowPercentInStatusBar(),
      false,
      "Default showPercentInStatusBar should be false"
    );

    const sb = (configManager as any).getStatusBarConfig?.();
    if (sb) {
      assert.strictEqual(
        sb.showPercent,
        false,
        "StatusBarConfig.showPercent should be false by default"
      );
      assert.strictEqual(sb.density, "auto", "StatusBarConfig.density should be 'auto' by default");
      assert.strictEqual(
        sb.displayMode,
        "both",
        "StatusBarConfig.displayMode should be 'both' by default"
      );
    }
  });

  test("Should reload configuration correctly", () => {
    // Test that reloadConfig doesn't throw and maintains functionality
    assert.doesNotThrow(() => {
      configManager.reloadConfig();
    }, "reloadConfig should not throw");

    // Verify functionality still works after reload
    assert.strictEqual(
      typeof configManager.isEnabled(),
      "boolean",
      "isEnabled should return boolean after reload"
    );
    assert.strictEqual(
      typeof configManager.getRefreshInterval(),
      "number",
      "getRefreshInterval should return number after reload"
    );
  });

  test("Should handle refresh interval bounds", () => {
    const interval = configManager.getRefreshInterval();
    assert.ok(interval >= 1, "Refresh interval should be at least 1 second");
    assert.ok(interval <= 300, "Refresh interval should be at most 300 seconds");
  });

  test("Should return valid enum values", () => {
    const clickAction = configManager.getClickAction();
    const validClickActions = ["refresh", "openWebsite", "openSettings"];
    assert.ok(
      validClickActions.includes(clickAction),
      `clickAction '${clickAction}' should be one of: ${validClickActions.join(", ")}`
    );

    const displayMode = configManager.getDisplayMode();
    const validDisplayModes = ["used", "remaining", "both"];
    assert.ok(
      validDisplayModes.includes(displayMode),
      `displayMode '${displayMode}' should be one of: ${validDisplayModes.join(", ")}`
    );

    const statusBarDensity = configManager.getStatusBarDensity();
    const validDensities = ["auto", "compact", "detailed"];
    assert.ok(
      validDensities.includes(statusBarDensity),
      `statusBarDensity '${statusBarDensity}' should be one of: ${validDensities.join(", ")}`
    );
  });

  test("Should handle updateConfig method", async () => {
    // Test that updateConfig doesn't throw (we can't easily test actual config changes in unit tests)
    await assert.doesNotReject(async () => {
      await configManager.updateConfig("enabled", false);
    }, "updateConfig should not reject");
  });
});
