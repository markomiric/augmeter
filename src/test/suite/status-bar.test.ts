import * as assert from "assert";
import * as vscode from "vscode";
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
}

suite("StatusBar tooltip Test Suite", () => {
  let config: ConfigManager;
  let manager: StatusBarManager;

  teardown(() => {
    try {
      manager?.dispose();
    } catch {}
  });

  test("Tooltip never includes percentage (kept simple)", async () => {
    config = new ConfigManager();
    await config.updateConfig("enabled", true);

    manager = new StatusBarManager(new FakeUsageTracker() as any, config);
    await manager.updateDisplay();

    const tooltip = (manager as any).statusBarItem.tooltip as string;
    assert.ok(!tooltip.includes("%"), `Tooltip should not include percentage, got: ${tooltip}`);
  });
});
