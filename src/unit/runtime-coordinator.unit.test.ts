import { describe, expect, it, vi } from "vitest";
import { RuntimeCoordinator } from "../bootstrap/runtime-coordinator";
import type { ConfigManager } from "../core/config/config-manager";
import type { StorageManager } from "../core/storage/storage-manager";
import type { UsageTracker } from "../features/usage/usage-tracker";
import type { ProviderUsageService } from "../providers/provider-usage-service";
import type { AuggieCliSource } from "../services/auggie-cli-source";
import type { AugmentApiClient } from "../services/augment-api-client";
import type { StatusBarManager } from "../ui/status-bar";

describe("RuntimeCoordinator refresh result", () => {
  it("reports failure when no Augment credit source is connected", async () => {
    let fetcher: (() => Promise<boolean>) | undefined;
    const usageTracker = {
      getFetchSource: () => "manual",
      setRealDataFetcher: vi.fn((nextFetcher: () => Promise<boolean>) => {
        fetcher = nextFetcher;
      }),
      clearRealDataFlag: vi.fn(),
      notifyChanged: vi.fn(),
    } as unknown as UsageTracker;
    const storageManager = {
      isCliAuthDisabled: () => false,
      setProviderHealth: vi.fn(async () => {}),
    } as unknown as StorageManager;
    const coordinator = new RuntimeCoordinator(
      {} as never,
      storageManager,
      { getDataSource: () => "cookie" } as unknown as ConfigManager,
      { hasCookie: () => false } as unknown as AugmentApiClient,
      usageTracker,
      { updateDisplay: vi.fn(async () => {}) } as unknown as StatusBarManager,
      { collectUsage: vi.fn(async () => {}) } as unknown as ProviderUsageService,
      {} as AuggieCliSource
    );

    (coordinator as unknown as { attachRealDataFetcher(): void }).attachRealDataFetcher();

    expect(fetcher).toBeDefined();
    await expect(fetcher?.()).resolves.toBe(false);
    expect(usageTracker.clearRealDataFlag).toHaveBeenCalledOnce();
    expect(usageTracker.notifyChanged).toHaveBeenCalledOnce();
  });
});
