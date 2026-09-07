import * as vscode from "vscode";
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
  function createCoordinator(
    options: {
      dataSource?: "cookie" | "auggie-cli";
      extensionEnabled?: boolean;
      hasCookie?: boolean;
      cliResult?: { status: string; error?: string };
      getUsageData?: () => Promise<unknown>;
      parseUsageResponse?: () => Promise<unknown>;
      providerTrackingEnabled?: boolean;
      enabledProviderIds?: string[];
      providerHealth?: unknown[];
    } = {}
  ): {
    coordinator: RuntimeCoordinator;
    fetcher: () => Promise<boolean>;
    usageTracker: UsageTracker;
    storageManager: StorageManager;
    providerUsageService: ProviderUsageService;
  } {
    let fetcher: (() => Promise<boolean>) | undefined;
    const requestGeneration = 0;
    const fetchGeneration = 0;
    const usageTracker = {
      getFetchSource: () => "manual",
      setRealDataFetcher: vi.fn((nextFetcher: () => Promise<boolean>) => {
        fetcher = nextFetcher;
      }),
      clearRealDataFlag: vi.fn(),
      notifyChanged: vi.fn(),
      triggerRefreshSoon: vi.fn(),
      updateWithRealData: vi.fn(async () => {}),
    } as unknown as UsageTracker;
    const storageManager = {
      isCliAuthDisabled: () => false,
      setProviderHealth: vi.fn(async () => {}),
      getAllProviderHealth: vi.fn(async () => options.providerHealth ?? []),
    } as unknown as StorageManager;
    const providerUsageService = {
      collectUsage: vi.fn(async () => {}),
    } as unknown as ProviderUsageService;
    const coordinator = new RuntimeCoordinator(
      {} as never,
      storageManager,
      {
        getDataSource: () => options.dataSource ?? "cookie",
        isEnabled: () => options.extensionEnabled ?? true,
        isProviderTrackingEnabled: () => options.providerTrackingEnabled ?? false,
        getEnabledProviderIds: () => options.enabledProviderIds ?? [],
      } as unknown as ConfigManager,
      {
        hasCookie: () => options.hasCookie ?? true,
        invalidateInFlightRequests: vi.fn(),
        getRequestGeneration: () => requestGeneration,
        isRequestGenerationCurrent: (generation: number) => generation === requestGeneration,
        getUsageData: options.getUsageData ?? (async () => ({ success: true, data: {} })),
        parseUsageResponse:
          options.parseUsageResponse ?? (async () => ({ totalUsage: 10, usageLimit: 100 })),
      } as unknown as AugmentApiClient,
      usageTracker,
      { updateDisplay: vi.fn(async () => {}) } as unknown as StatusBarManager,
      providerUsageService,
      {
        reset: vi.fn(),
        getFetchGeneration: () => fetchGeneration,
        isFetchGenerationCurrent: (generation: number) => generation === fetchGeneration,
        fetchUsage: vi.fn(async () => options.cliResult ?? { status: "cli-missing" }),
      } as unknown as AuggieCliSource
    );

    (coordinator as unknown as { attachRealDataFetcher(): void }).attachRealDataFetcher();
    return {
      coordinator,
      fetcher: () => {
        if (!fetcher) {
          throw new Error("Runtime fetcher was not attached");
        }
        return fetcher();
      },
      usageTracker,
      storageManager,
      providerUsageService,
    };
  }

  it("treats signed-out Augment as optional when local refresh succeeds", async () => {
    const { fetcher, storageManager } = createCoordinator({
      hasCookie: false,
      providerTrackingEnabled: true,
      enabledProviderIds: ["claude"],
    });

    await expect(fetcher()).resolves.toBe(true);
    expect(storageManager.setProviderHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "augment",
        status: "disabled",
        errorCode: "AUGMENT_SIGNED_OUT",
      })
    );
  });

  it("does not mark a disconnected source as failed when its pending save rejects", async () => {
    const { coordinator, fetcher, usageTracker, storageManager } = createCoordinator();
    const api = (coordinator as unknown as { apiClient: AugmentApiClient }).apiClient;
    vi.mocked(usageTracker.updateWithRealData).mockImplementation(async () => {
      vi.spyOn(api, "isRequestGenerationCurrent").mockReturnValue(false);
      throw new Error("Usage reset while saving");
    });
    expect(await fetcher()).toBe(false);
    expect(storageManager.setProviderHealth).not.toHaveBeenCalled();
  });

  it("skips provider collection when an in-flight refresh reaches a disabled extension", async () => {
    const { fetcher, providerUsageService } = createCoordinator({ extensionEnabled: false });

    await expect(fetcher()).resolves.toBe(false);
    expect(providerUsageService.collectUsage).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "a response that cannot be parsed",
      parseUsageResponse: async () => null,
    },
    {
      name: "a transient API response",
      getUsageData: async () => ({ success: false, status: 503, error: "fixture outage" }),
    },
    {
      name: "a thrown API error",
      getUsageData: async () => {
        throw new Error("network unavailable");
      },
    },
  ])("records degraded Augment health for $name", async ({ getUsageData, parseUsageResponse }) => {
    const { fetcher, storageManager, usageTracker } = createCoordinator({
      getUsageData,
      parseUsageResponse,
    });

    await expect(fetcher()).resolves.toBe(false);
    expect(usageTracker.clearRealDataFlag).not.toHaveBeenCalled();
    expect(usageTracker.updateWithRealData).not.toHaveBeenCalled();
    expect(storageManager.setProviderHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "augment",
        status: "degraded",
        sourceKind: "api",
        errorCode: "AUGMENT_REFRESH_FAILED",
        message: "Augment credits couldn't be refreshed. Showing the last known data.",
      })
    );
  });

  it("keeps API usage known without inventing a quota", async () => {
    const { fetcher, usageTracker } = createCoordinator({
      parseUsageResponse: async () => ({ totalUsage: 500 }),
    });

    await expect(fetcher()).resolves.toBe(true);
    expect(usageTracker.updateWithRealData).toHaveBeenCalledWith(
      expect.objectContaining({ totalUsage: 500, usageLimit: undefined })
    );
  });

  it("records degraded Augment health for a CLI error", async () => {
    const { fetcher, storageManager, usageTracker } = createCoordinator({
      dataSource: "auggie-cli",
      cliResult: { status: "error", error: "private CLI details" },
    });

    await expect(fetcher()).resolves.toBe(false);
    expect(usageTracker.clearRealDataFlag).not.toHaveBeenCalled();
    expect(usageTracker.updateWithRealData).not.toHaveBeenCalled();
    expect(storageManager.setProviderHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "augment",
        status: "degraded",
        sourceKind: "cli",
        errorCode: "AUGMENT_REFRESH_FAILED",
        message: "Augment credits couldn't be refreshed. Showing the last known data.",
      })
    );
  });

  it("reports an enabled provider collection failure", async () => {
    const { fetcher } = createCoordinator({
      hasCookie: false,
      providerTrackingEnabled: true,
      enabledProviderIds: ["claude"],
      providerHealth: [
        {
          providerId: "claude",
          status: "degraded",
          checkedAt: new Date().toISOString(),
          canCollectInCurrentWorkspace: true,
          errorCode: "PROVIDER_COLLECTION_FAILED",
        },
      ],
    });

    await expect(fetcher()).resolves.toBe(false);
  });

  it("refreshes local providers when workspace trust is granted", () => {
    let onTrustGranted: (() => void) | undefined;
    const workspace = vscode.workspace as unknown as {
      onDidGrantWorkspaceTrust?: (listener: () => void) => vscode.Disposable;
    };
    const previous = workspace.onDidGrantWorkspaceTrust;
    workspace.onDidGrantWorkspaceTrust = listener => {
      onTrustGranted = listener;
      return { dispose: vi.fn() };
    };

    try {
      const { coordinator, usageTracker } = createCoordinator();
      (
        coordinator as unknown as { registerWorkspaceTrustListener(): void }
      ).registerWorkspaceTrustListener();

      onTrustGranted?.();

      expect(usageTracker.triggerRefreshSoon).toHaveBeenCalledWith(0, "trust-granted");
    } finally {
      workspace.onDidGrantWorkspaceTrust = previous;
    }
  });
});
