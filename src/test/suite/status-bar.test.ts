import * as assert from "assert";
import type * as vscode from "vscode";
import { ConfigManager } from "../../core/config/config-manager";
import { StatusBarManager } from "../../ui/status-bar";

class FakeUsageTracker {
  private hasRealData = true;

  getCurrentUsage() {
    return 50;
  }
  getCurrentLimit() {
    return 100;
  }
  getRemainingCredits() {
    return 50;
  }
  isCurrentUsageKnown() {
    return true;
  }
  getMonthlyAllowance() {
    return null;
  }
  hasRealUsageData() {
    return this.hasRealData;
  }
  setHasRealData(value: boolean) {
    this.hasRealData = value;
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
  async getProjectedDepletionDate() {
    return null;
  }
  getSessionActivity() {
    return null;
  }
  async getProviderUsageSnapshots() {
    const nowIso = new Date().toISOString();
    return [
      {
        providerId: "claude",
        timestamp: nowIso,
        windowType: "rolling_5h",
        metricType: "messages",
        sourceKind: "file",
        used: 12,
      },
      {
        providerId: "claude",
        timestamp: nowIso,
        windowType: "weekly_7d",
        metricType: "messages",
        sourceKind: "file",
        used: 84,
      },
      {
        providerId: "codex",
        timestamp: nowIso,
        windowType: "rolling_5h",
        metricType: "messages",
        sourceKind: "file",
        used: 8,
      },
      {
        providerId: "codex",
        timestamp: nowIso,
        windowType: "weekly_7d",
        metricType: "messages",
        sourceKind: "file",
        used: 42,
      },
    ];
  }
  async getProviderHealthSnapshots() {
    const nowIso = new Date().toISOString();
    return [
      {
        providerId: "claude",
        status: "connected",
        checkedAt: nowIso,
        canCollectInCurrentWorkspace: true,
      },
      {
        providerId: "codex",
        status: "connected",
        checkedAt: nowIso,
        canCollectInCurrentWorkspace: true,
      },
    ];
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
    assert.ok(
      tooltip.includes("**Assistant usage**"),
      `Tooltip should lead with assistant usage, got: ${tooltip}`
    );
    assert.ok(
      tooltip.includes("Augment credits"),
      `Tooltip should identify Augment credits, got: ${tooltip}`
    );
    assert.ok(
      tooltip.includes("Used:** 50 of 100 credits"),
      `Tooltip should include used credits and limit, got: ${tooltip}`
    );
    assert.ok(tooltip.includes("Remaining"), `Tooltip should include remaining, got: ${tooltip}`);
    assert.ok(
      tooltip.includes("**Assistant activity:**"),
      `Tooltip should include providers, got: ${tooltip}`
    );
    assert.ok(
      tooltip.includes("Claude Code: 12 turns in 5 hours • 84 turns in 7 days"),
      `Tooltip should include Claude provider usage, got: ${tooltip}`
    );
    assert.ok(
      tooltip.includes("Codex: 8 turns in 5 hours • 42 turns in 7 days"),
      `Tooltip should include Codex provider usage, got: ${tooltip}`
    );
  });

  test("Tooltip keeps local assistant activity visible when Augment is disconnected", async () => {
    config = new ConfigManager();
    await config.updateConfig("enabled", true);

    const tracker = new FakeUsageTracker();
    tracker.setHasRealData(false);
    manager = new StatusBarManager(tracker as any, config);
    await manager.updateDisplay();

    const rawTooltip = (manager as any).statusBarItem.tooltip;
    const tooltip = typeof rawTooltip === "string" ? rawTooltip : (rawTooltip?.value ?? "");
    assert.ok(
      tooltip.includes("**Augment credits:** Not connected"),
      `Tooltip should explain the disconnected Augment state, got: ${tooltip}`
    );
    assert.ok(
      tooltip.includes("Claude Code: 12 turns in 5 hours • 84 turns in 7 days"),
      `Tooltip should retain local activity, got: ${tooltip}`
    );
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
      await config.updateConfig("showPercentInStatusBar", false);
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

  test("show percent adds context to non-percentage modes", async () => {
    config = new ConfigManager();
    await config.updateConfig("enabled", true);
    await config.updateConfig("showInStatusBar", true);
    await config.updateConfig("displayMode", "used");
    await config.updateConfig("statusBarDensity", "compact");
    await config.updateConfig("showPercentInStatusBar", true);

    manager = new StatusBarManager(new FakeUsageTracker() as any, config);
    await manager.updateDisplay();

    const text = (manager as any).statusBarItem.text as string;
    assert.strictEqual(text, "50/100 (50%)");
  });
});
