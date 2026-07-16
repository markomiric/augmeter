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
    const copilotApiConfig = configManager.getCopilotApiConfig();
    assert.strictEqual(copilotApiConfig.enabled, false);
    assert.strictEqual(copilotApiConfig.username, "");
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
  });

  test("Should handle updateConfig method", async () => {
    // Test that updateConfig doesn't throw (we can't easily test actual config changes in unit tests)
    await assert.doesNotReject(async () => {
      await configManager.updateConfig("enabled", false);
    }, "updateConfig should not reject");
  });
});
