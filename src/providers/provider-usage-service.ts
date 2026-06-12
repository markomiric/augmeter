import {
  type ProviderHealthSnapshot,
  type ProviderId,
  type ProviderUsageSnapshot,
} from "../core/types/provider-usage";
import { type ConfigManager } from "../core/config/config-manager";
import { type StorageManager } from "../core/storage/storage-manager";
import { SecureLogger } from "../core/logging/secure-logger";
import { UserNotificationService } from "../core/notifications/user-notification-service";
import { type ProviderAdapter } from "./provider-adapter";
import { type ProviderRegistry } from "./provider-registry";
import * as vscode from "vscode";

export interface ProviderCollectionOptions {
  now?: Date;
  workspaceTrusted: boolean;
  source?: string;
  forceRefresh?: boolean;
}

export class ProviderUsageService {
  constructor(
    private readonly storageManager: StorageManager,
    private readonly configManager: ConfigManager,
    private readonly registry: ProviderRegistry
  ) {}

  async collectUsage(options: ProviderCollectionOptions): Promise<void> {
    const now = options.now ?? new Date();
    const enabledByConfig = this.configManager.isProviderTrackingEnabled();
    const enabledIds = new Set<ProviderId>(this.configManager.getEnabledProviderIds());
    const adapters = this.registry.getAll();
    const providerIds = adapters.map(adapter => adapter.id);

    const healthSnapshots: ProviderHealthSnapshot[] = [];
    const usageSnapshots: ProviderUsageSnapshot[] = [];

    for (const adapter of adapters) {
      if (!enabledByConfig || !enabledIds.has(adapter.id)) {
        healthSnapshots.push(
          this.createHealth(adapter, "disabled", now, "Provider is disabled by settings.")
        );
        continue;
      }

      if (!options.workspaceTrusted && adapter.supportsUntrustedWorkspaces !== true) {
        healthSnapshots.push(
          this.createHealth(
            adapter,
            "restricted",
            now,
            "Provider tracking is disabled in untrusted workspaces."
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
        usageSnapshots.push(...result.snapshots);
      } catch (error) {
        SecureLogger.warn(`Provider collection failed (${adapter.id})`, error);
        healthSnapshots.push(
          this.createHealth(
            adapter,
            "degraded",
            now,
            "Provider collection failed; see logs for details.",
            "PROVIDER_COLLECTION_FAILED"
          )
        );
      }
    }

    await this.storageManager.replaceProviderUsageSnapshotsForProviders(
      providerIds,
      usageSnapshots
    );
    await this.storageManager.cleanOldProviderSnapshots(
      this.configManager.getHistoryRetentionDays()
    );

    if (healthSnapshots.length > 0) {
      await this.storageManager.setProviderHealthBulk(healthSnapshots);
    }

    if (usageSnapshots.length > 0) {
      await this.checkProviderAlerts(usageSnapshots, now);
    }

    SecureLogger.info("Provider usage collection completed", {
      source: options.source ?? "unknown",
      workspaceTrusted: options.workspaceTrusted,
      enabledByConfig,
      adaptersSeen: adapters.length,
      snapshotsStored: usageSnapshots.length,
      healthUpdated: healthSnapshots.length,
    });
  }

  private async checkProviderAlerts(snapshots: ProviderUsageSnapshot[], now: Date): Promise<void> {
    const grouped = new Map<string, ProviderUsageSnapshot[]>();
    for (const snapshot of snapshots) {
      const providerId = this.normalizeProviderId(snapshot.providerId);
      if (!providerId || providerId === "augment") {
        continue;
      }
      const list = grouped.get(providerId);
      if (list) {
        list.push(snapshot);
      } else {
        grouped.set(providerId, [snapshot]);
      }
    }

    for (const [providerId, providerSnapshots] of grouped) {
      try {
        const alertConfig = this.configManager.getProviderAlertThresholds(providerId);
        const target = this.configManager.getProviderMonthlyTarget(providerId);
        const basis = this.buildAlertBasis(providerId, providerSnapshots, target, now);
        if (!basis) {
          continue;
        }

        const thresholds = [alertConfig.critical, alertConfig.high, alertConfig.warning].sort(
          (a, b) => b - a
        );
        const lastNotified = await this.storageManager.getProviderNotifiedThresholdForCycle(
          providerId,
          basis.cycleId
        );

        for (const threshold of thresholds) {
          if (basis.percentage >= threshold && lastNotified < threshold) {
            await this.storageManager.setProviderNotifiedThresholdForCycle(
              providerId,
              basis.cycleId,
              threshold
            );

            const remainingText =
              basis.remaining !== null
                ? `${Math.max(0, Math.round(basis.remaining)).toLocaleString()} remaining`
                : "remaining estimate unavailable";
            const scope = basis.usesConfiguredTarget ? "configured target" : "tracked limit";
            const message = `Augmeter (${basis.label}): ${threshold}% of ${scope} reached (${remainingText}).`;

            if (threshold >= alertConfig.critical) {
              void UserNotificationService.showWarning(message, {
                text: "View Usage",
                action: async () => {
                  await vscode.commands.executeCommand("augmeter.openUsageDashboard");
                },
              });
            } else {
              void UserNotificationService.showInfo(message);
            }
            break;
          }
        }

        if (alertConfig.runOutDays > 0 && basis.projectedDays !== null && basis.projectedDays > 0) {
          const runOutAlreadyAlerted = await this.storageManager.isProviderRunOutAlertedForCycle(
            providerId,
            basis.cycleId
          );
          if (!runOutAlreadyAlerted && basis.projectedDays <= alertConfig.runOutDays) {
            await this.storageManager.setProviderRunOutAlertedForCycle(
              providerId,
              basis.cycleId,
              true
            );

            const scope = basis.usesConfiguredTarget ? "target" : "limit";
            void UserNotificationService.showWarning(
              `Augmeter (${basis.label}): At current pace, usage may hit ${scope} in ~${Math.max(1, Math.round(basis.projectedDays))} day(s).`,
              {
                text: "View Usage",
                action: async () => {
                  await vscode.commands.executeCommand("augmeter.openUsageDashboard");
                },
              }
            );
          }
        }
      } catch (error) {
        SecureLogger.warn(`Provider alert evaluation failed (${providerId})`, error);
      }
    }
  }

  private buildAlertBasis(
    providerId: string,
    snapshots: ProviderUsageSnapshot[],
    target: number,
    now: Date
  ): {
    label: string;
    cycleId: string;
    percentage: number;
    remaining: number | null;
    projectedDays: number | null;
    usesConfiguredTarget: boolean;
  } | null {
    const sorted = snapshots
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const withLimit = sorted.find(snapshot => {
      return (
        this.toFiniteNumber(snapshot.limit) !== null ||
        (this.toFiniteNumber(snapshot.used) !== null &&
          this.toFiniteNumber(snapshot.remaining) !== null)
      );
    });

    if (withLimit) {
      const used = this.toFiniteNumber(withLimit.used);
      const remainingFromSnapshot = this.toFiniteNumber(withLimit.remaining);
      let limit = this.toFiniteNumber(withLimit.limit);

      if (limit === null && used !== null && remainingFromSnapshot !== null) {
        limit = used + remainingFromSnapshot;
      }
      if (limit === null || limit <= 0) {
        return null;
      }

      const resolvedUsed = used ?? Math.max(limit - (remainingFromSnapshot ?? 0), 0);
      const remaining = remainingFromSnapshot ?? Math.max(limit - resolvedUsed, 0);
      const percentage = Math.max(
        0,
        Math.round(
          this.toFiniteNumber(withLimit.percentUsed) ?? (resolvedUsed / Math.max(limit, 1)) * 100
        )
      );

      const dailyRate = this.estimateDailyRateFromSnapshot(withLimit);
      const projectedDays =
        remaining > 0 && dailyRate !== null && dailyRate > 0 ? remaining / dailyRate : null;

      return {
        label: this.providerLabel(providerId),
        cycleId: this.getCycleId(withLimit.resetAt, now),
        percentage,
        remaining,
        projectedDays,
        usesConfiguredTarget: false,
      };
    }

    if (target <= 0) {
      return null;
    }

    const weekly = sorted.find(
      snapshot => snapshot.windowType === "weekly_7d" && this.toFiniteNumber(snapshot.used) !== null
    );
    const rolling = sorted.find(
      snapshot =>
        snapshot.windowType === "rolling_5h" && this.toFiniteNumber(snapshot.used) !== null
    );
    const daily = sorted.find(
      snapshot => snapshot.windowType === "daily" && this.toFiniteNumber(snapshot.used) !== null
    );
    const monthly = sorted.find(
      snapshot => snapshot.windowType === "monthly" && this.toFiniteNumber(snapshot.used) !== null
    );

    const source = monthly || weekly || daily || rolling;
    if (!source) {
      return null;
    }

    const usedRaw = this.toFiniteNumber(source.used);
    if (usedRaw === null) {
      return null;
    }

    let dailyRate: number | null = null;
    let monthlyEstimate = usedRaw;

    if (source.windowType === "weekly_7d") {
      dailyRate = usedRaw / 7;
      monthlyEstimate = dailyRate * 30;
    } else if (source.windowType === "rolling_5h") {
      dailyRate = (usedRaw / 5) * 24;
      monthlyEstimate = dailyRate * 30;
    } else if (source.windowType === "daily") {
      dailyRate = usedRaw;
      monthlyEstimate = dailyRate * 30;
    } else if (source.windowType === "monthly") {
      dailyRate = usedRaw / 30;
      monthlyEstimate = usedRaw;
    }

    const remaining = Math.max(target - monthlyEstimate, 0);
    const percentage = Math.max(0, Math.round((monthlyEstimate / Math.max(target, 1)) * 100));
    const projectedDays =
      dailyRate !== null && dailyRate > 0 && remaining > 0 ? remaining / dailyRate : null;

    return {
      label: this.providerLabel(providerId),
      cycleId: this.getCycleId(undefined, now),
      percentage,
      remaining,
      projectedDays,
      usesConfiguredTarget: true,
    };
  }

  private estimateDailyRateFromSnapshot(snapshot: ProviderUsageSnapshot): number | null {
    const used = this.toFiniteNumber(snapshot.used);
    if (used === null || used < 0) {
      return null;
    }

    if (snapshot.windowType === "weekly_7d") {
      return used / 7;
    }
    if (snapshot.windowType === "rolling_5h") {
      return (used / 5) * 24;
    }
    if (snapshot.windowType === "daily") {
      return used;
    }
    if (snapshot.windowType === "monthly") {
      return used / 30;
    }
    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private getCycleId(resetAt: string | undefined, now: Date): string {
    if (typeof resetAt === "string" && resetAt.length > 0) {
      const date = new Date(resetAt);
      if (!Number.isNaN(date.getTime())) {
        return `reset-${date.toISOString().split("T")[0]}`;
      }
    }
    return `month-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  private providerLabel(providerId: string): string {
    if (providerId === "claude") return "Claude Code";
    if (providerId === "codex") return "Codex";
    if (providerId === "copilot") return "GitHub Copilot";
    if (providerId === "augment") return "Augment";
    return providerId;
  }

  private normalizeProviderId(providerId: ProviderId): string {
    if (typeof providerId !== "string") {
      return "";
    }
    return providerId.trim().toLowerCase();
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
}
