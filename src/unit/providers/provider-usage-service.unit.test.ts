import type * as vscode from "vscode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigManager } from "../../core/config/config-manager";
import { UserNotificationService } from "../../core/notifications/user-notification-service";
import { StorageManager } from "../../core/storage/storage-manager";
import { type ProviderUsageSnapshot } from "../../core/types/provider-usage";
import { type ProviderAdapter } from "../../providers/provider-adapter";
import { ProviderRegistry } from "../../providers/provider-registry";
import { ProviderUsageService } from "../../providers/provider-usage-service";

function createMockContext(): vscode.ExtensionContext {
  const state = new Map<string, unknown>();

  const globalState = {
    get<T>(key: string, defaultValue?: T): T | undefined {
      if (!state.has(key)) {
        return defaultValue;
      }
      return state.get(key) as T;
    },
    async update(key: string, value: unknown): Promise<void> {
      state.set(key, value);
    },
    setKeysForSync(): void {},
    keys(): readonly string[] {
      return Array.from(state.keys());
    },
  };

  return {
    globalState,
  } as unknown as vscode.ExtensionContext;
}

function makeSnapshot(providerId: string): ProviderUsageSnapshot {
  return {
    providerId,
    timestamp: new Date("2026-02-16T12:00:00.000Z").toISOString(),
    windowType: "rolling_5h",
    metricType: "messages",
    sourceKind: "derived",
    used: 5,
  };
}

function makeAdapter(providerId: string): ProviderAdapter {
  return {
    id: providerId,
    displayName: providerId,
    collectUsage: async () => ({
      snapshots: [makeSnapshot(providerId)],
      health: {
        providerId,
        status: "connected",
        checkedAt: new Date().toISOString(),
        canCollectInCurrentWorkspace: true,
      },
    }),
  };
}

describe("ProviderUsageService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collects snapshots and health for enabled providers", async () => {
    const storage = new StorageManager(createMockContext());
    const config = new ConfigManager();
    vi.spyOn(config, "isProviderTrackingEnabled").mockReturnValue(true);
    vi.spyOn(config, "getEnabledProviderIds").mockReturnValue(["claude", "codex"]);
    vi.spyOn(config, "getHistoryRetentionDays").mockReturnValue(35);

    const service = new ProviderUsageService(
      storage,
      config,
      new ProviderRegistry([makeAdapter("claude"), makeAdapter("codex")])
    );

    await service.collectUsage({
      workspaceTrusted: true,
      now: new Date("2026-02-16T12:00:00.000Z"),
      forceRefresh: true,
      source: "unit-test",
    });

    expect(await storage.getProviderUsageSnapshots()).toHaveLength(2);
    expect(await storage.getAllProviderHealth()).toHaveLength(2);
  });

  it("marks providers as disabled when provider tracking is off", async () => {
    const storage = new StorageManager(createMockContext());
    const config = new ConfigManager();
    vi.spyOn(config, "isProviderTrackingEnabled").mockReturnValue(false);
    vi.spyOn(config, "getEnabledProviderIds").mockReturnValue(["claude"]);
    vi.spyOn(config, "getHistoryRetentionDays").mockReturnValue(35);

    const service = new ProviderUsageService(
      storage,
      config,
      new ProviderRegistry([makeAdapter("claude")])
    );

    await service.collectUsage({
      workspaceTrusted: true,
      now: new Date("2026-02-16T12:00:00.000Z"),
      forceRefresh: true,
      source: "unit-test",
    });

    const health = await storage.getProviderHealth("claude");
    expect(health?.status).toBe("disabled");
    expect(await storage.getProviderUsageSnapshots()).toHaveLength(0);
  });

  it("deduplicates provider threshold notifications per cycle", async () => {
    const storage = new StorageManager(createMockContext());
    const config = new ConfigManager();
    vi.spyOn(config, "isProviderTrackingEnabled").mockReturnValue(true);
    vi.spyOn(config, "getEnabledProviderIds").mockReturnValue(["claude"]);
    vi.spyOn(config, "getHistoryRetentionDays").mockReturnValue(35);
    vi.spyOn(config, "getProviderMonthlyTarget").mockReturnValue(100);
    vi.spyOn(config, "getProviderAlertThresholds").mockReturnValue({
      warning: 70,
      high: 85,
      critical: 95,
      runOutDays: 2,
    });

    const infoSpy = vi
      .spyOn(UserNotificationService, "showInfo")
      .mockImplementation(async () => undefined);
    const warnSpy = vi
      .spyOn(UserNotificationService, "showWarning")
      .mockImplementation(async () => undefined);

    const providerId = "claude";
    const adapter: ProviderAdapter = {
      id: providerId,
      displayName: "Claude Code",
      collectUsage: async () => ({
        snapshots: [
          {
            providerId,
            timestamp: new Date("2026-02-16T12:00:00.000Z").toISOString(),
            windowType: "weekly_7d",
            metricType: "messages",
            sourceKind: "derived",
            used: 30,
          },
        ],
        health: {
          providerId,
          status: "connected",
          checkedAt: new Date("2026-02-16T12:00:00.000Z").toISOString(),
          canCollectInCurrentWorkspace: true,
        },
      }),
    };

    const service = new ProviderUsageService(storage, config, new ProviderRegistry([adapter]));

    await service.collectUsage({
      workspaceTrusted: true,
      now: new Date("2026-02-16T12:00:00.000Z"),
      forceRefresh: true,
      source: "unit-test",
    });
    await service.collectUsage({
      workspaceTrusted: true,
      now: new Date("2026-02-16T12:02:00.000Z"),
      forceRefresh: true,
      source: "unit-test-repeat",
    });

    expect(infoSpy).toHaveBeenCalledTimes(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "Claude Code activity is projected at 129% of your monthly turn target.",
      expect.objectContaining({ text: "Open assistant usage" })
    );
  });

  it("replaces stale provider snapshots when a provider is disabled", async () => {
    const storage = new StorageManager(createMockContext());
    await storage.saveProviderUsageSnapshot({
      providerId: "claude",
      timestamp: new Date("2026-02-15T12:00:00.000Z").toISOString(),
      windowType: "weekly_7d",
      metricType: "messages",
      sourceKind: "derived",
      used: 99,
    });

    const config = new ConfigManager();
    vi.spyOn(config, "isProviderTrackingEnabled").mockReturnValue(false);
    vi.spyOn(config, "getEnabledProviderIds").mockReturnValue(["claude"]);
    vi.spyOn(config, "getHistoryRetentionDays").mockReturnValue(35);

    const service = new ProviderUsageService(
      storage,
      config,
      new ProviderRegistry([makeAdapter("claude")])
    );

    await service.collectUsage({
      workspaceTrusted: true,
      now: new Date("2026-02-16T12:00:00.000Z"),
      forceRefresh: true,
      source: "unit-test",
    });

    expect(await storage.getProviderUsageSnapshots("claude")).toHaveLength(0);
    expect((await storage.getProviderHealth("claude"))?.status).toBe("disabled");
  });
});
