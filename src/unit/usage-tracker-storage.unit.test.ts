import type * as vscode from "vscode";
import { describe, expect, it, vi } from "vitest";
import type { ConfigManager } from "../core/config/config-manager";
import { StorageManager } from "../core/storage/storage-manager";
import { UsageTracker } from "../features/usage/usage-tracker";
import { UserNotificationService } from "../core/notifications/user-notification-service";

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
  it("does not infer a balance, percentage, or exhaustion from usage without a quota", async () => {
    const storage = new StorageManager(createMockContext());
    const tracker = new UsageTracker(storage, {
      getHistoryRetentionDays: () => 35,
      getAlertThresholds: () => ({ warning: 75, high: 90, critical: 95 }),
      getRunOutAlertDays: () => 3,
    } as ConfigManager);
    await tracker.updateWithRealData({ totalUsage: 1200, sourceKind: "api" });
    expect(await tracker.getProjectedDaysRemaining()).toBeNull();
    expect(await tracker.getProjectedDepletionDate()).toBeNull();
    const [snapshot] = await storage.getProviderUsageSnapshots("augment");
    expect(snapshot?.used).toBe(1200);
    expect(snapshot?.remaining).toBeUndefined();
    expect(snapshot?.percentUsed).toBeUndefined();
    expect(snapshot?.limit).toBeUndefined();
    tracker.dispose();
  });

  it("reports persistence failures to the refresh coordinator", async () => {
    const storage = new StorageManager(createMockContext());
    vi.spyOn(storage, "saveUsageData").mockRejectedValue(new Error("Storage unavailable"));
    const tracker = new UsageTracker(storage, {} as ConfigManager);
    await expect(tracker.updateWithRealData({ totalUsage: 10 })).rejects.toThrow(
      "Storage unavailable"
    );
    tracker.dispose();
  });

  it("waits for an accepted update before reset clears persisted usage", async () => {
    const storage = new StorageManager(createMockContext());
    const saveUsageData = storage.saveUsageData.bind(storage);
    let releaseSave!: () => void;
    let signalSaveStarted!: () => void;
    let firstSave = true;
    const saveStarted = new Promise<void>(resolve => {
      signalSaveStarted = resolve;
    });
    const saveGate = new Promise<void>(resolve => {
      releaseSave = resolve;
    });
    vi.spyOn(storage, "saveUsageData").mockImplementation(async data => {
      if (firstSave) {
        firstSave = false;
        signalSaveStarted();
        await saveGate;
      }
      await saveUsageData(data);
    });
    const tracker = new UsageTracker(storage, {
      getHistoryRetentionDays: () => 35,
      getAlertThresholds: () => ({ warning: 75, high: 90, critical: 95 }),
      getRunOutAlertDays: () => 3,
    } as ConfigManager);

    const update = tracker.updateWithRealData({
      totalUsage: 120,
      usageLimit: 1_000,
      sourceKind: "api",
    });
    await saveStarted;

    let resetFinished = false;
    const reset = tracker.resetUsage().then(() => {
      resetFinished = true;
    });
    await Promise.resolve();
    expect(resetFinished).toBe(false);

    releaseSave();
    await expect(update).rejects.toThrow("Augment credit update discarded after a usage reset.");
    await reset;

    expect(resetFinished).toBe(true);
    expect((await storage.getUsageData()).totalUsage).toBe(0);
    expect(await storage.getProviderUsageSnapshots("augment")).toHaveLength(0);
    expect(await storage.getProviderHealth("augment")).toBeNull();
    expect(tracker.hasRealUsageData()).toBe(false);
    tracker.dispose();
  });

  it("uses hours in a sub-day run-out notification", async () => {
    const storage = new StorageManager(createMockContext());
    const tracker = new UsageTracker(storage, {
      getAlertThresholds: () => ({ warning: 75, high: 90, critical: 95 }),
      getRunOutAlertDays: () => 3,
    } as ConfigManager);
    vi.spyOn(tracker, "getProjectedDaysRemaining").mockResolvedValue(2 / 24);
    const warning = vi.spyOn(UserNotificationService, "showWarning").mockResolvedValue(undefined);
    await (
      tracker as unknown as { checkThresholdNotifications(percentage: number): Promise<void> }
    ).checkThresholdNotifications(20);
    expect(warning).toHaveBeenCalledWith(
      "At your current pace, Augment credits may run out in about 2 hours.",
      expect.any(Object)
    );
    warning.mockRestore();
    tracker.dispose();
  });

  it("reports a failed manual fetch to command handlers", async () => {
    const storage = new StorageManager(createMockContext());
    const tracker = new UsageTracker(storage, { isEnabled: () => true } as ConfigManager);
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
