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

  test("Sign out state always shows icon and Augmeter branding", async () => {
    // Set density to detailed
    await config.updateConfig("statusBarDensity", "detailed");
    await config.updateConfig("statusBarIcon", "dashboard");
    await config.updateConfig("showInStatusBar", true);

    manager = new StatusBarManager(mockUsageTracker as any, config, mockDetector as any);

    // Simulate signed out state (no auth, no real data)
    mockDetector.setHasApiCookie(false);
    mockUsageTracker.setHasRealData(false);

    // Update display should show sign out state with branding
    await manager.updateDisplay();

    // Get the status bar item text
    const statusBarItem = (manager as any).statusBarItem;
    const text = statusBarItem.text;

    // Should include icon and "Augmeter" branding
    assert.ok(text.includes("$(dashboard)"), `Expected icon in sign out text, got: ${text}`);
    assert.ok(text.includes("Augmeter"), `Expected "Augmeter" text, got: ${text}`);
  });

  test("Sign out state shows icon even in compact density", async () => {
    // Set density to compact — icon still shown in non-data states
    await config.updateConfig("statusBarDensity", "compact");
    await config.updateConfig("statusBarIcon", "dashboard");
    await config.updateConfig("showInStatusBar", true);

    manager = new StatusBarManager(mockUsageTracker as any, config, mockDetector as any);

    // Simulate signed out state
    mockDetector.setHasApiCookie(false);
    mockUsageTracker.setHasRealData(false);

    await manager.updateDisplay();

    const statusBarItem = (manager as any).statusBarItem;
    const text = statusBarItem.text;

    // Non-data states always show icon + "Augmeter" regardless of density
    assert.ok(text.includes("$(dashboard)"), `Expected icon even in compact mode, got: ${text}`);
    assert.ok(text.includes("Augmeter"), `Expected "Augmeter" text, got: ${text}`);
  });

  test("Connected state transitions to sign out state after sign out", async () => {
    await config.updateConfig("statusBarIcon", "dashboard");
    await config.updateConfig("showInStatusBar", true);
    manager = new StatusBarManager(mockUsageTracker as any, config, mockDetector as any);

    // Start in connected state (authenticated but no real data)
    mockDetector.setHasApiCookie(true);
    mockUsageTracker.setHasRealData(false);

    await manager.updateDisplay();
    let statusBarItem = (manager as any).statusBarItem;
    // Connected state uses spinner icon
    assert.ok(
      statusBarItem.text.includes("$(sync~spin)"),
      `Should show spinner in connected state, got: ${statusBarItem.text}`
    );
    assert.ok(statusBarItem.text.includes("Augmeter"), "Should show Augmeter branding");

    // Simulate sign out process
    mockDetector.setHasApiCookie(false);
    await mockUsageTracker.resetUsage();
    mockDetector.clearAuthCache();

    // Update display after sign out
    await manager.updateDisplay();

    statusBarItem = (manager as any).statusBarItem;
    // Sign out state uses configured icon (dashboard), not spinner
    assert.ok(
      statusBarItem.text.includes("$(dashboard)"),
      `Should show dashboard icon after sign out, got: ${statusBarItem.text}`
    );
    assert.ok(
      !statusBarItem.text.includes("$(sync~spin)"),
      `Should not show spinner after sign out, got: ${statusBarItem.text}`
    );
    assert.ok(statusBarItem.text.includes("Augmeter"), "Should still show Augmeter branding");
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
