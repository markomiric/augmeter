import type * as vscode from "vscode";
import { describe, expect, it } from "vitest";
import type { ConfigManager } from "../core/config/config-manager";
import { StorageManager } from "../core/storage/storage-manager";
import { UsageTracker } from "../features/usage/usage-tracker";

function createMockContext(): vscode.ExtensionContext {
  const state = new Map<string, unknown>();

  return {
    globalState: {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return state.has(key) ? (state.get(key) as T) : defaultValue;
      },
      async update(key: string, value: unknown): Promise<void> {
        state.set(key, value);
      },
      setKeysForSync(): void {},
      keys(): readonly string[] {
        return Array.from(state.keys());
      },
    },
  } as unknown as vscode.ExtensionContext;
}

describe("UsageTracker snapshot storage", () => {
  it("reports a failed manual fetch to command handlers", async () => {
    const storage = new StorageManager(createMockContext());
    const tracker = new UsageTracker(storage, {} as ConfigManager);
    tracker.setRealDataFetcher(async () => false);

    await expect(tracker.refreshNow()).resolves.toBe(false);

    tracker.dispose();
  });

  it("keeps one Augment provider snapshot while preserving credit trend history", async () => {
    const storage = new StorageManager(createMockContext());
    const config = {
      getHistoryRetentionDays: () => 35,
      getAlertThresholds: () => ({ warning: 75, high: 90, critical: 95 }),
      getRunOutAlertDays: () => 3,
    } as unknown as ConfigManager;
    const tracker = new UsageTracker(storage, config);

    await tracker.updateWithRealData({
      totalUsage: 10,
      usageLimit: 1_000,
      sourceKind: "api",
    });
    await tracker.updateWithRealData({
      totalUsage: 20,
      usageLimit: 1_000,
      sourceKind: "api",
    });

    expect(await storage.getProviderUsageSnapshots("augment")).toHaveLength(1);
    expect(await storage.getUsageSnapshots()).toHaveLength(2);

    tracker.dispose();
  });
});
