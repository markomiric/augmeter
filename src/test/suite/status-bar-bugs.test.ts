import * as assert from "assert";
import type * as vscode from "vscode";
import { ConfigManager } from "../../core/config/config-manager";
import { StatusBarManager } from "../../ui/status-bar";
import { AugmentDetector } from "../../services/augment-detector";

// Mock classes for testing
class MockUsageTracker {
  private hasRealData = false;
  private currentUsage = 0;
  private currentLimit = 0;

  getCurrentUsage() {
    return this.currentUsage;
  }

  getCurrentLimit() {
    return this.currentLimit;
  }

  hasRealUsageData() {
    return this.hasRealData;
  }

  getDataSource() {
    return "test";
  }

  setHasRealData(value: boolean) {
    this.hasRealData = value;
  }

  async resetUsage() {
    this.hasRealData = false;
    this.currentUsage = 0;
    this.currentLimit = 0;
  }

  stopDataFetching() {
    // Mock implementation
  }

  onChanged(_cb: () => void) {
    return { dispose() {} } as vscode.Disposable;
  }
}

class MockAugmentDetector {
  private hasApiCookieValue = false;

  hasApiCookie() {
    return this.hasApiCookieValue;
  }

  setHasApiCookie(value: boolean) {
    this.hasApiCookieValue = value;
  }

  clearAuthCache() {
    // Mock implementation - could clear internal cache
  }

  getApiClient() {
    return {
      clearSessionCookie: async () => {
        this.hasApiCookieValue = false;
      },
    };
  }
}

suite("Status Bar Bugs Test Suite", () => {
  let config: ConfigManager;
  let manager: StatusBarManager;
  let mockUsageTracker: MockUsageTracker;
  let mockDetector: MockAugmentDetector;

  setup(() => {
    config = new ConfigManager();
    mockUsageTracker = new MockUsageTracker();
    mockDetector = new MockAugmentDetector();
  });

  teardown(async () => {
    try {
      manager?.dispose();
    } catch {}
    try {
      await config.updateConfig("statusBarDensity", "auto");
      await config.updateConfig("statusBarIcon", "dashboard");
      await config.updateConfig("showInStatusBar", true);
    } catch {}
  });

  test("Bug Fix: Sign in state shows icon when density is detailed", async () => {
    // Set density to detailed
    await config.updateConfig("statusBarDensity", "detailed");
    await config.updateConfig("statusBarIcon", "dashboard");
    await config.updateConfig("showInStatusBar", true);

    manager = new StatusBarManager(mockUsageTracker as any, config, mockDetector as any);

    // Simulate signed out state (no auth, no real data)
    mockDetector.setHasApiCookie(false);
    mockUsageTracker.setHasRealData(false);

    // Update display should show sign in state
    await manager.updateDisplay();

    // Get the status bar item text
    const statusBarItem = (manager as any).statusBarItem;
    const text = statusBarItem.text;

    // Should include icon when density is detailed
    assert.ok(text.includes("$(dashboard)"), `Expected icon in sign in text, got: ${text}`);
    assert.ok(text.includes("Sign in"), `Expected "Sign in" text, got: ${text}`);
  });

  test("Bug Fix: Sign in state shows no icon when density is compact", async () => {
    // Set density to compact
    await config.updateConfig("statusBarDensity", "compact");
    await config.updateConfig("showInStatusBar", true);

    manager = new StatusBarManager(mockUsageTracker as any, config, mockDetector as any);

    // Simulate signed out state
    mockDetector.setHasApiCookie(false);
    mockUsageTracker.setHasRealData(false);

    await manager.updateDisplay();

    const statusBarItem = (manager as any).statusBarItem;
    const text = statusBarItem.text;

    // Should not include icon when density is compact
    assert.ok(!text.includes("$("), `Expected no icon in compact mode, got: ${text}`);
    assert.strictEqual(text, "Sign in", `Expected just "Sign in" text, got: ${text}`);
  });

  test("Bug Fix: Connected state transitions to Sign in after sign out", async () => {
    await config.updateConfig("showInStatusBar", true);
    manager = new StatusBarManager(mockUsageTracker as any, config, mockDetector as any);

    // Start in connected state (authenticated but no real data)
    mockDetector.setHasApiCookie(true);
    mockUsageTracker.setHasRealData(false);

    await manager.updateDisplay();
    let statusBarItem = (manager as any).statusBarItem;
    assert.ok(statusBarItem.text.includes("Connected"), "Should start in Connected state");

    // Simulate sign out process
    mockDetector.setHasApiCookie(false);
    await mockUsageTracker.resetUsage();
    mockDetector.clearAuthCache();

    // Update display after sign out
    await manager.updateDisplay();

    statusBarItem = (manager as any).statusBarItem;
    assert.ok(
      statusBarItem.text.includes("Sign in"),
      `Should show Sign in after sign out, got: ${statusBarItem.text}`
    );
    assert.ok(
      !statusBarItem.text.includes("Connected"),
      `Should not show Connected after sign out, got: ${statusBarItem.text}`
    );
  });

  test("Click command is set correctly for each state", async () => {
    await config.updateConfig("showInStatusBar", true);
    manager = new StatusBarManager(mockUsageTracker as any, config, mockDetector as any);

    // Test sign in state click command
    mockDetector.setHasApiCookie(false);
    mockUsageTracker.setHasRealData(false);
    await manager.updateDisplay();

    let statusBarItem = (manager as any).statusBarItem;
    assert.strictEqual(
      statusBarItem.command,
      "augmeter.smartSignIn",
      "Sign in state should use smartSignIn command"
    );

    // Test connected state click command
    mockDetector.setHasApiCookie(true);
    mockUsageTracker.setHasRealData(false);
    await manager.updateDisplay();

    statusBarItem = (manager as any).statusBarItem;
    assert.strictEqual(
      statusBarItem.command,
      "augmeter.manualRefresh",
      "Connected state should have manualRefresh command"
    );
  });
});
