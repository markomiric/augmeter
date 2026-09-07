import {
  type ProviderHealthSnapshot,
  type ProviderId,
  type ProviderUsageSnapshot,
} from "../core/types/provider-usage";
import { type ConfigManager } from "../core/config/config-manager";
import { type StorageManager } from "../core/storage/storage-manager";
import { SecureLogger } from "../core/logging/secure-logger";
import { type ProviderAdapter } from "./provider-adapter";

export interface ProviderCollectionOptions {
  now?: Date;
  workspaceTrusted: boolean;
  source?: string;
  forceRefresh?: boolean;
}

const TRANSIENT_PROVIDER_ERROR_CODES = new Set([
  "COPILOT_QUERY_FAILED",
  "PROVIDER_COLLECTION_FAILED",
]);

export class ProviderUsageService {
  constructor(
    private readonly storageManager: StorageManager,
    private readonly configManager: ConfigManager,
    private readonly adapters: readonly ProviderAdapter[]
  ) {}

  async collectUsage(options: ProviderCollectionOptions): Promise<void> {
    const now = options.now ?? new Date();
    const enabledByConfig = this.configManager.isProviderTrackingEnabled();
    const enabledIds = new Set<ProviderId>(this.configManager.getEnabledProviderIds());
    const adapters = this.adapters;
    const providersToReplace = new Set<ProviderId>();

    const healthSnapshots: ProviderHealthSnapshot[] = [];
    const usageSnapshots: ProviderUsageSnapshot[] = [];

    for (const adapter of adapters) {
      if (!enabledByConfig || !enabledIds.has(adapter.id)) {
        providersToReplace.add(adapter.id);
        healthSnapshots.push(
          this.createHealth(
            adapter,
            "disabled",
            now,
            `${adapter.displayName} activity tracking is off.`
          )
        );
        continue;
      }

      if (!options.workspaceTrusted && adapter.supportsUntrustedWorkspaces !== true) {
        providersToReplace.add(adapter.id);
        healthSnapshots.push(
          this.createHealth(
            adapter,
            "restricted",
            now,
            `${adapter.displayName} activity is not read in untrusted workspaces.`
          )
        );
        continue;
      }

      try {
        const collectContext: {
          now: Date;
          workspaceTrusted: boolean;
          forceRefresh?: boolean;
        } = {
          now,
          workspaceTrusted: options.workspaceTrusted,
        };
        if (options.forceRefresh !== undefined) {
          collectContext.forceRefresh = options.forceRefresh;
        }

        const result = await adapter.collectUsage(collectContext);

        healthSnapshots.push(result.health);
        if (!this.isTransientFailure(result.health)) {
          providersToReplace.add(adapter.id);
          usageSnapshots.push(...result.snapshots);
        }
      } catch (error) {
        SecureLogger.warn(`Provider collection failed (${adapter.id})`, error);
        healthSnapshots.push(
          this.createHealth(
            adapter,
            "degraded",
            now,
            `${adapter.displayName} activity couldn't be read. Check Output > Augmeter.`,
            "PROVIDER_COLLECTION_FAILED"
          )
        );
      }
    }

    await this.storageManager.replaceProviderUsageSnapshotsForProviders(
      Array.from(providersToReplace),
      usageSnapshots
    );
    await this.storageManager.cleanOldProviderSnapshots(
      this.configManager.getHistoryRetentionDays(),
      now
    );

    if (healthSnapshots.length > 0) {
      await this.storageManager.setProviderHealthBulk(healthSnapshots);
    }

    SecureLogger.info("Assistant activity collection completed", {
      source: options.source ?? "unknown",
      workspaceTrusted: options.workspaceTrusted,
      enabledByConfig,
      adaptersSeen: adapters.length,
      snapshotsStored: usageSnapshots.length,
      healthUpdated: healthSnapshots.length,
    });
  }

  private createHealth(
    adapter: ProviderAdapter,
    status: ProviderHealthSnapshot["status"],
    now: Date,
    message: string,
    errorCode?: string
  ): ProviderHealthSnapshot {
    const health: ProviderHealthSnapshot = {
      providerId: adapter.id,
      status,
      checkedAt: now.toISOString(),
      canCollectInCurrentWorkspace: status !== "restricted",
      sourceKind: "unknown",
      message,
    };
    if (errorCode) {
      health.errorCode = errorCode;
    }
    return health;
  }

  private isTransientFailure(health: ProviderHealthSnapshot): boolean {
    return (
      (health.status === "degraded" || health.status === "unavailable") &&
      TRANSIENT_PROVIDER_ERROR_CODES.has(health.errorCode ?? "")
    );
  }
}
