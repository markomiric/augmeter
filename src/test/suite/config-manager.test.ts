import * as assert from "assert";
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
    assert.strictEqual(
      configManager.getHistoryRetentionDays(),
      35,
      "Default retention should be 35 days"
    );
    assert.deepStrictEqual(
      configManager.getAlertThresholds(),
      { warning: 75, high: 90, critical: 95 },
      "Default alert thresholds should match manifest defaults"
    );
    assert.strictEqual(
      configManager.getRunOutAlertDays(),
      3,
      "Default run-out alert days should be 3"
    );
    assert.strictEqual(
      configManager.getMonthlyTarget(),
      0,
      "Default monthly target should be disabled"
    );
    assert.strictEqual(
      configManager.isProviderTrackingEnabled(),
      true,
      "Provider tracking should default to enabled in trusted workspace"
    );
    assert.deepStrictEqual(configManager.getEnabledProviderIds(), ["claude", "codex", "copilot"]);
    assert.deepStrictEqual(
      configManager.getProviderMonthlyTargets(),
      {},
      "Provider targets should default to empty map"
    );
    assert.strictEqual(
      configManager.getProviderMonthlyTarget("claude"),
      0,
      "Provider monthly target should default to disabled"
    );
    assert.deepStrictEqual(configManager.getProviderAlertThresholds("claude"), {
      warning: 75,
      high: 90,
      critical: 95,
      runOutDays: 3,
    });
    const copilotApiConfig = configManager.getCopilotApiConfig();
    assert.strictEqual(copilotApiConfig.enabled, false);
    assert.strictEqual(copilotApiConfig.username, "");
    assert.strictEqual(copilotApiConfig.tokenEnvVar, "GITHUB_TOKEN");
    assert.strictEqual(copilotApiConfig.baseUrl, "https://api.github.com");
    assert.strictEqual(copilotApiConfig.timeoutMs, 6000);
    assert.strictEqual(
      configManager.getApiBaseUrl(),
      "https://app.augmentcode.com/api",
      "Default API base URL should match manifest defaults"
    );
    assert.strictEqual(configManager.getSmartSignInQuickWatchMs(), 2000);
    assert.strictEqual(configManager.getSmartSignInWebsiteWatchMs(), 300000);
    assert.strictEqual(
      configManager.getClaudeProjectsPath(),
      "",
      "Default Claude projects path should be empty"
    );
    assert.strictEqual(
      configManager.getCodexSessionsPath(),
      "",
      "Default Codex sessions path should be empty"
    );
    assert.strictEqual(
      configManager.getCopilotStateDbPath(),
      "",
      "Default Copilot state DB path should be empty"
    );
    assert.strictEqual(
      configManager.getColorScheme(),
      "standard",
      "Default color scheme should be standard"
    );
    assert.strictEqual(
      configManager.isEnhancedReadabilityEnabled(),
      false,
      "Enhanced readability should default to false"
    );
    assert.strictEqual(
      configManager.shouldAutoDetectHighContrast(),
      true,
      "Auto high contrast should default to true"
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
    const validDisplayModes = ["used", "remaining", "remainingOnly", "both", "percentage"];
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
