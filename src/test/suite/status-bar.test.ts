import * as assert from "assert";
import type * as vscode from "vscode";
import { ConfigManager } from "../../core/config/config-manager";
import { StatusBarManager } from "../../ui/status-bar";

class FakeUsageTracker {
  getCurrentUsage() {
    return 50;
  }
  getCurrentLimit() {
    return 100;
  }
  hasRealUsageData() {
    return true;
  }
  getDataSource() {
    return "test";
  }
  getLastFetchedAt() {
    return new Date();
  }
  getSubscriptionType() {
    return undefined;
  }
  getRenewalDate() {
    return undefined;
  }
  async getUsageRate() {
    return null;
  }
  async getProjectedDaysRemaining() {
    return null;
  }
  getSessionActivity() {
    return null;
  }
  onChanged(_cb: () => void) {
    return { dispose() {} } as vscode.Disposable;
  }
}

suite("StatusBar tooltip Test Suite", () => {
  let config: ConfigManager;
  let manager: StatusBarManager;

  teardown(() => {
    try {
      manager?.dispose();
    } catch {}
  });

  test("Tooltip includes usage bar, used, and remaining", async () => {
    config = new ConfigManager();
    await config.updateConfig("enabled", true);

    manager = new StatusBarManager(new FakeUsageTracker() as any, config);
    await manager.updateDisplay();

    const rawTooltip = (manager as any).statusBarItem.tooltip;
    const tooltip = typeof rawTooltip === "string" ? rawTooltip : (rawTooltip?.value ?? "");
    assert.ok(tooltip.includes("Augmeter"), `Tooltip should include title, got: ${tooltip}`);
    assert.ok(tooltip.includes("50 / 100"), `Tooltip should include used/limit, got: ${tooltip}`);
    assert.ok(tooltip.includes("Remaining"), `Tooltip should include remaining, got: ${tooltip}`);
  });
});

suite("StatusBar RemainingOnly Mode", () => {
  let config: ConfigManager;
  let manager: StatusBarManager;

  teardown(async () => {
    try {
      manager?.dispose();
    } catch {}
    if (config) {
      await config.updateConfig("displayMode", "both");
      await config.updateConfig("statusBarDensity", "auto");
      await config.updateConfig("statusBarIcon", "dashboard");
    }
  });

  test("compact density shows only remaining number", async () => {
    config = new ConfigManager();
    await config.updateConfig("enabled", true);
    await config.updateConfig("showInStatusBar", true);
    await config.updateConfig("displayMode", "remainingOnly");
    await config.updateConfig("statusBarDensity", "compact");

    manager = new StatusBarManager(new FakeUsageTracker() as any, config);
    await manager.updateDisplay();

    const text = (manager as any).statusBarItem.text as string;
    // used=50, limit=100 -> remaining=50
    assert.strictEqual(text, "50", `Expected remaining-only value '50', got: ${text}`);
  });

  test("detailed density shows icon and remaining number", async () => {
    config = new ConfigManager();
    await config.updateConfig("enabled", true);
    await config.updateConfig("showInStatusBar", true);
    await config.updateConfig("displayMode", "remainingOnly");
    await config.updateConfig("statusBarDensity", "detailed");
    await config.updateConfig("statusBarIcon", "dashboard");

    manager = new StatusBarManager(new FakeUsageTracker() as any, config);
    await manager.updateDisplay();

    const text = (manager as any).statusBarItem.text as string;
    assert.ok(text.startsWith("$("), `Expected icon prefix in detailed mode, got: ${text}`);
    assert.ok(text.endsWith(" 50"), `Expected remaining-only value '50' after icon, got: ${text}`);

    const rawTooltip = (manager as any).statusBarItem.tooltip;
    const tooltip = typeof rawTooltip === "string" ? rawTooltip : (rawTooltip?.value ?? "");
    assert.ok(
      tooltip.includes("**Remaining:** 50"),
      `Tooltip should clearly state remaining credits, got: ${tooltip}`
    );
  });
});
