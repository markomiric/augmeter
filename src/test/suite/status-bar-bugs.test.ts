import * as assert from "assert";
import type * as vscode from "vscode";
import { ConfigManager } from "../../core/config/config-manager";
import { StatusBarManager } from "../../ui/status-bar";

// Mock classes for testing
class MockUsageTracker {
  private hasRealData = false;
  private currentUsage = 0;
  private currentLimit = 0;
  private nextProviderRead: {
    signalStarted: () => void;
    wait: Promise<void>;
  } | null = null;

  getCurrentUsage() {
    return this.currentUsage;
  }

  getCurrentLimit() {
    return this.currentLimit;
  }

  getRemainingCredits() {
    return Math.max(this.currentLimit - this.currentUsage, 0);
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

  getDataSource() {
    return "test";
  }

  setHasRealData(value: boolean) {
    this.hasRealData = value;
  }

  blockNextProviderRead(): { started: Promise<void>; release: () => void } {
    let signalStarted = () => {};
    let release = () => {};
    const started = new Promise<void>(resolve => {
      signalStarted = resolve;
    });
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    this.nextProviderRead = { signalStarted, wait };
    return { started, release };
  }

  async getProviderUsageSnapshots() {
    const pending = this.nextProviderRead;
    if (pending) {
      this.nextProviderRead = null;
      pending.signalStarted();
      await pending.wait;
    }
    return [];
  }

  async getProviderHealthSnapshots() {
    return [];
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

class MockApiClient {
  private hasCookieValue = false;

  hasCookie() {
    return this.hasCookieValue;
  }

  setHasCookie(value: boolean) {
    this.hasCookieValue = value;
  }

  async clearSessionCookie() {
    this.hasCookieValue = false;
  }
}

suite("Status Bar Bugs Test Suite", () => {
  let config: ConfigManager;
  let manager: StatusBarManager;
  let mockUsageTracker: MockUsageTracker;
  let mockApiClient: MockApiClient;

  setup(() => {
    config = new ConfigManager();
    mockUsageTracker = new MockUsageTracker();
    mockApiClient = new MockApiClient();
  });

  teardown(async () => {
    try {
      manager?.dispose();
    } catch {}
    try {
      await config.updateConfig("showInStatusBar", true);
    } catch {}
  });

  test("Sign out state always shows icon and Augmeter branding", async () => {
    // Set density to detailed
    await config.updateConfig("showInStatusBar", true);

    manager = new StatusBarManager(mockUsageTracker as any, config, mockApiClient as any);

    // Simulate signed out state (no auth, no real data)
    mockApiClient.setHasCookie(false);
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

  test("Sign out state always shows the dashboard icon", async () => {
    // Set density to compact — icon still shown in non-data states
    await config.updateConfig("showInStatusBar", true);

    manager = new StatusBarManager(mockUsageTracker as any, config, mockApiClient as any);

    // Simulate signed out state
    mockApiClient.setHasCookie(false);
    mockUsageTracker.setHasRealData(false);

    await manager.updateDisplay();

    const statusBarItem = (manager as any).statusBarItem;
    const text = statusBarItem.text;

    // Non-data states always show icon + "Augmeter" regardless of density
    assert.ok(text.includes("$(dashboard)"), `Expected icon even in compact mode, got: ${text}`);
    assert.ok(text.includes("Augmeter"), `Expected "Augmeter" text, got: ${text}`);
  });

  test("Connected state transitions to sign out state after sign out", async () => {
    await config.updateConfig("showInStatusBar", true);
    manager = new StatusBarManager(mockUsageTracker as any, config, mockApiClient as any);

    // Start in connected state (authenticated but no real data)
    mockApiClient.setHasCookie(true);
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
    mockApiClient.setHasCookie(false);
    await mockUsageTracker.resetUsage();

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
    manager = new StatusBarManager(mockUsageTracker as any, config, mockApiClient as any);

    // The disconnected state remains useful for local assistant activity.
    mockApiClient.setHasCookie(false);
    mockUsageTracker.setHasRealData(false);
    await manager.updateDisplay();

    let statusBarItem = (manager as any).statusBarItem;
    assert.strictEqual(
      statusBarItem.command,
      "augmeter.openUsageDashboard",
      "Disconnected state should open the assistant usage overview"
    );
    assert.ok(
      typeof statusBarItem.tooltip !== "string" &&
        statusBarItem.tooltip?.value?.includes("command:augmeter.openUsageDashboard"),
      "Disconnected tooltip should include the assistant usage link"
    );

    // Test connected state click command
    mockApiClient.setHasCookie(true);
    mockUsageTracker.setHasRealData(false);
    await manager.updateDisplay();

    statusBarItem = (manager as any).statusBarItem;
    assert.strictEqual(
      statusBarItem.command,
      "augmeter.manualRefresh",
      "Connected state should have manualRefresh command"
    );
    assert.ok(
      typeof statusBarItem.tooltip !== "string" &&
        statusBarItem.tooltip?.value?.includes("command:augmeter.openUsageDashboard"),
      "Connected tooltip should include a dashboard link"
    );
  });

  test("A slow disconnected render cannot overwrite a newer connected state", async () => {
    await config.updateConfig("showInStatusBar", true);
    manager = new StatusBarManager(mockUsageTracker as any, config, mockApiClient as any);
    await manager.updateDisplay();
    await new Promise<void>(resolve => setImmediate(resolve));

    mockApiClient.setHasCookie(false);
    mockUsageTracker.setHasRealData(false);
    const blockedRead = mockUsageTracker.blockNextProviderRead();
    const disconnectedRender = manager.updateDisplay();
    await blockedRead.started;

    mockApiClient.setHasCookie(true);
    const connectedRender = manager.updateDisplay();
    await connectedRender;

    const statusBarItem = (manager as any).statusBarItem;
    assert.strictEqual(statusBarItem.command, "augmeter.manualRefresh");

    blockedRead.release();
    await disconnectedRender;

    assert.strictEqual(
      statusBarItem.command,
      "augmeter.manualRefresh",
      "The stale disconnected render should not restore the sign-in command"
    );
  });
});
