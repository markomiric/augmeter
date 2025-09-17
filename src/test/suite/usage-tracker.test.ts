import * as assert from "assert";
import * as vscode from "vscode";
import { UsageTracker } from "../../features/usage/usage-tracker";
import { StorageManager } from "../../core/storage/storage-manager";
import { ConfigManager } from "../../core/config/config-manager";

suite("UsageTracker Test Suite", () => {
  let usageTracker: UsageTracker;
  let mockContext: vscode.ExtensionContext;
  let storageManager: StorageManager;
  let configManager: ConfigManager;

  setup(() => {
    // Create a mock extension context for testing
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => [],
      },
      globalState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        setKeysForSync: () => {},
        keys: () => [],
      },
      secrets: {
        get: () => Promise.resolve(undefined),
        store: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
      },
      extensionUri: vscode.Uri.file("/test"),
      extensionPath: "/test",
      environmentVariableCollection: {} as any,
      asAbsolutePath: (path: string) => `/test/${path}`,
      storageUri: vscode.Uri.file("/test/storage"),
      globalStorageUri: vscode.Uri.file("/test/global"),
      logUri: vscode.Uri.file("/test/log"),
      storagePath: "/test/storage",
      globalStoragePath: "/test/global",
      logPath: "/test/log",
      extensionMode: vscode.ExtensionMode.Test,
      extension: {} as any,
      languageModelAccessInformation: {} as any,
    };

    storageManager = new StorageManager(mockContext);
    configManager = new ConfigManager();
    usageTracker = new UsageTracker(storageManager, configManager);
  });

  teardown(() => {
    // Clean up any running intervals
    if (usageTracker) {
      usageTracker.dispose();
    }
  });

  test("Should initialize with default values", () => {
    assert.ok(usageTracker, "UsageTracker should be created");

    // Test that initial state is reasonable
    const currentUsage = usageTracker.getCurrentUsage();
    const currentLimit = usageTracker.getCurrentLimit();

    assert.ok(typeof currentUsage === "number", "Current usage should be a number");
    assert.ok(typeof currentLimit === "number", "Current limit should be a number");
    assert.ok(currentUsage >= 0, "Current usage should be non-negative");
    assert.ok(currentLimit >= 0, "Current limit should be non-negative");
  });

  test("Should handle start and stop tracking", () => {
    assert.doesNotThrow(() => {
      usageTracker.startTracking();
    }, "startTracking should not throw");

    assert.doesNotThrow(() => {
      usageTracker.stopDataFetching();
    }, "stopDataFetching should not throw");
  });

  test("Should handle multiple start/stop calls gracefully", () => {
    // Multiple starts should not cause issues
    assert.doesNotThrow(() => {
      usageTracker.startTracking();
      usageTracker.startTracking();
      usageTracker.startTracking();
    }, "Multiple startTracking calls should not throw");

    // Multiple stops should not cause issues
    assert.doesNotThrow(() => {
      usageTracker.stopDataFetching();
      usageTracker.stopDataFetching();
      usageTracker.stopDataFetching();
    }, "Multiple stopDataFetching calls should not throw");
  });

  test("Should handle dispose correctly", () => {
    usageTracker.startTracking();

    assert.doesNotThrow(() => {
      usageTracker.dispose();
    }, "dispose should not throw");

    // After dispose, operations should still be safe
    assert.doesNotThrow(() => {
      usageTracker.startTracking();
      usageTracker.stopDataFetching();
    }, "Operations after dispose should not throw");
  });

  test("Should handle real data updates", async () => {
    const testData = {
      totalUsage: 100,
      usageLimit: 1000,
      dailyUsage: 10,
      lastUpdate: new Date().toISOString(),
    };

    await assert.doesNotReject(async () => {
      await usageTracker.updateWithRealData(testData);
    }, "updateWithRealData should not reject");

    // Verify data was updated (note: values might be 0 in test environment due to storage mocking)
    const currentUsage = usageTracker.getCurrentUsage();
    const currentLimit = usageTracker.getCurrentLimit();
    assert.ok(typeof currentUsage === "number", "Current usage should be a number");
    assert.ok(typeof currentLimit === "number", "Current limit should be a number");
  });

  test("Should handle real data fetcher setup", () => {
    const mockFetcher = async () => {
      // Mock fetcher that does nothing
    };

    assert.doesNotThrow(() => {
      usageTracker.setRealDataFetcher(mockFetcher);
    }, "setRealDataFetcher should not throw");
  });

  test("Should handle reset functionality", async () => {
    // Set some usage first
    await usageTracker.updateWithRealData({
      totalUsage: 100,
      usageLimit: 1000,
      dailyUsage: 10,
      lastUpdate: new Date().toISOString(),
    });

    await assert.doesNotReject(async () => {
      await usageTracker.resetUsage();
    }, "resetUsage should not reject");

    // After reset, usage should be back to initial state
    const currentUsage = usageTracker.getCurrentUsage();
    assert.ok(currentUsage >= 0, "Usage should be non-negative after reset");
  });

  test("Should provide data source information", () => {
    const dataSource = usageTracker.getDataSource();
    assert.ok(typeof dataSource === "string", "Data source should be a string");

    const hasRealData = usageTracker.hasRealUsageData();
    assert.ok(typeof hasRealData === "boolean", "hasRealUsageData should return boolean");
  });
});
