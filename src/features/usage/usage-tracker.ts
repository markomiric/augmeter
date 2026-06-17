/**
 * ABOUTME: This file tracks usage data, manages polling intervals, and emits change events
 * when usage data is updated from the API or local storage.
 */
import * as vscode from "vscode";
import { type StorageManager, type UsageSnapshot } from "../../core/storage/storage-manager";
import { type ConfigManager } from "../../core/config/config-manager";
import { SecureLogger } from "../../core/logging/secure-logger";
import { UserNotificationService } from "../../core/notifications/user-notification-service";
import { type SessionActivity } from "../../services/session-reader";
import {
  type ProviderHealthSnapshot,
  type ProviderId,
  type ProviderUsageSnapshot,
} from "../../core/types/provider-usage";
import {
  buildAlertCycleId,
  calculateProjectedDays,
  readTrackedSessionActivity,
  selectTriggeredThreshold,
  shouldNotifyProjectedRunOut,
} from "./usage-tracker-helpers";

/**
 * Real usage data fetched from the Augment API.
 */
export interface RealUsageData {
  totalUsage?: number | undefined;
  usageLimit?: number | undefined;
  dailyUsage?: number | undefined;
  lastUpdate?: string | undefined;
  subscriptionType?: string | undefined;
  renewalDate?: string | undefined;
}

/**
 * Tracks usage data and manages polling for updates.
 *
 * This class provides:
 * - Local usage tracking with daily breakdown
 * - Real usage data from the API
 * - Change event emission for UI updates
 * - Periodic cleanup of old data
 * - Jittered polling to avoid synchronized requests
 *
 * @example
 * ```typescript
 * const tracker = new UsageTracker(storageManager, configManager);
 * tracker.startTracking();
 * tracker.onChanged(() => console.log("Usage updated"));
 * ```
 */
export class UsageTracker implements vscode.Disposable {
  private storageManager: StorageManager;
  private configManager: ConfigManager;
  private disposables: vscode.Disposable[] = [];
  private currentUsage: number = 0;
  private currentLimit: number = 0;
  private lastResetDate: string = "";
  private hasRealData: boolean = false;
  private realDataSource: string = "simulation";
  private realDataFetcher: (() => Promise<void>) | null = null;
  private intervals: NodeJS.Timeout[] = [];
  private pollTimeout: NodeJS.Timeout | null = null;
  private disposed: boolean = false;
  private tracking: boolean = false;
  private nextFetchSource: string = "poller";
  private windowFocused: boolean = true;
  private readonly randomFn: () => number;
  private subscriptionType: string | undefined;
  private renewalDate: string | undefined;
  private lastFetchedAt: Date | undefined;
  private onChangedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onChanged: vscode.Event<void> = this.onChangedEmitter.event;

  /**
   * @param randomFn Injectable source of randomness for jitter, defaulting to
   *   `Math.random`. Provided for deterministic testing of polling intervals.
   */
  constructor(
    storageManager: StorageManager,
    configManager: ConfigManager,
    randomFn: () => number = Math.random
  ) {
    this.storageManager = storageManager;
    this.configManager = configManager;
    this.randomFn = randomFn;
    void this.loadCurrentUsage();
  }

  private async loadCurrentUsage(): Promise<void> {
    const data = await this.storageManager.getUsageData();
    this.currentUsage = data.totalUsage;
    this.lastResetDate = data.lastResetDate;
  }

  startTracking(): void {
    if (!this.configManager.isEnabled()) {
      return;
    }

    // Idempotency guard: startTracking() is called at init AND again when
    // augmeter.enabled flips back to true. Without this guard each re-enable
    // would leak another 24h cleanup interval. stopDataFetching()/dispose()
    // reset the flag so a later re-enable can start cleanly.
    if (this.tracking) {
      return;
    }
    this.tracking = true;

    // Periodic cleanup of old data
    const cleanupInterval = setInterval(
      () => {
        void this.storageManager.cleanOldData();
      },
      24 * 60 * 60 * 1000
    ); // Daily cleanup
    this.intervals.push(cleanupInterval);

    // Start jittered polling using timeouts to avoid sync across users
    this.scheduleNextFetch(0, "startup"); // immediate first fetch
  }

  async resetUsage(): Promise<void> {
    await this.storageManager.resetUsage();
    await this.storageManager.resetAlertState();
    const data = await this.storageManager.getUsageData();
    this.currentUsage = data.totalUsage;
    this.lastResetDate = data.lastResetDate;
    this.hasRealData = false;
    this.realDataSource = "no_data";
    this.onChangedEmitter.fire();
  }

  getCurrentUsage(): number {
    return Math.round(this.currentUsage);
  }

  getCurrentLimit(): number {
    if (this.hasRealData && this.realDataSource === "augment_api") {
      return this.currentLimit;
    }
    return 0;
  }

  getLastResetDate(): string {
    return new Date(this.lastResetDate).toLocaleDateString();
  }

  hasRealUsageData(): boolean {
    return this.hasRealData;
  }

  getDataSource(): string {
    return this.realDataSource;
  }

  getSubscriptionType(): string | undefined {
    return this.subscriptionType;
  }

  getRenewalDate(): string | undefined {
    return this.renewalDate;
  }

  getLastFetchedAt(): Date | undefined {
    return this.lastFetchedAt;
  }

  getMonthlyTarget(): number {
    return this.configManager.getMonthlyTarget();
  }

  getTargetDelta(): number | null {
    const target = this.getMonthlyTarget();
    if (target <= 0) return null;
    return target - this.currentUsage;
  }

  getTargetProgressPercent(): number | null {
    const target = this.getMonthlyTarget();
    if (target <= 0) return null;
    return Math.round((this.currentUsage / target) * 100);
  }

  getRemainingCredits(): number {
    return this.currentLimit > 0 ? Math.max(this.currentLimit - this.currentUsage, 0) : 0;
  }

  async getProjectedDepletionDate(): Promise<Date | null> {
    const projectedDays = await this.getProjectedDaysRemaining();
    if (projectedDays === null) return null;
    return new Date(Date.now() + projectedDays * 24 * 60 * 60 * 1000);
  }

  async getUsageSnapshots(): Promise<UsageSnapshot[]> {
    return (await this.storageManager.getUsageSnapshots()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async getProviderUsageSnapshots(providerId?: ProviderId): Promise<ProviderUsageSnapshot[]> {
    return (await this.storageManager.getProviderUsageSnapshots(providerId)).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async getProviderHealthSnapshots(): Promise<ProviderHealthSnapshot[]> {
    return (await this.storageManager.getAllProviderHealth()).sort((a, b) =>
      a.providerId.localeCompare(b.providerId)
    );
  }

  /**
   * Compute the credit consumption rate per hour from stored snapshots.
   * Returns null if fewer than 2 snapshots exist or the time span is too short.
   */
  async getUsageRate(windowHours: number = 24): Promise<number | null> {
    return UsageTracker.computeUsageRate(
      await this.storageManager.getUsageSnapshots(),
      windowHours
    );
  }

  /**
   * Pure, static rate computation for testability.
   */
  static computeUsageRate(snapshots: UsageSnapshot[], windowHours: number = 24): number | null {
    if (snapshots.length < 2) return null;

    const now = Date.now();
    const windowMs = windowHours * 60 * 60 * 1000;
    const cutoff = now - windowMs;

    const inWindow = snapshots
      .filter(s => new Date(s.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (inWindow.length < 2) return null;

    const earliest = inWindow[0]!;
    const latest = inWindow[inWindow.length - 1]!;
    const deltaConsumed = latest.consumed - earliest.consumed;
    const deltaMs = new Date(latest.timestamp).getTime() - new Date(earliest.timestamp).getTime();

    // Need at least 1 minute of data
    if (deltaMs < 60_000) return null;

    // Negative delta means billing cycle reset — discard
    if (deltaConsumed < 0) return null;

    const hours = deltaMs / (60 * 60 * 1000);
    return deltaConsumed / hours;
  }

  /**
   * Project how many days of credits remain based on the current consumption rate.
   * Returns null if rate is unavailable or zero.
   */
  async getProjectedDaysRemaining(): Promise<number | null> {
    const remaining = this.currentLimit > 0 ? this.currentLimit - this.currentUsage : 0;
    if (remaining <= 0) return 0;

    const rate = await this.getUsageRate();
    return calculateProjectedDays(remaining, rate);
  }

  /**
   * Pure, static projection computation for testability.
   */
  static computeProjectedDays(remaining: number, ratePerHour: number | null): number | null {
    return calculateProjectedDays(remaining, ratePerHour);
  }

  /**
   * Get today's session activity (prompts/sessions) from local Augment session files.
   * Returns null if session tracking is disabled or on error.
   */
  getSessionActivity(): SessionActivity | null {
    return readTrackedSessionActivity(
      this.configManager.isSessionTrackingEnabled(),
      this.configManager.getSessionTrackingPath() || undefined
    );
  }

  async updateWithRealData(realData: RealUsageData): Promise<void> {
    try {
      SecureLogger.info("UsageTracker: updateWithRealData called", {
        totalUsage: realData.totalUsage,
        usageLimit: realData.usageLimit,
        dailyUsage: realData.dailyUsage,
        hasTotalUsage: realData.totalUsage !== undefined,
        hasUsageLimit: realData.usageLimit !== undefined,
      });

      if (realData.totalUsage !== undefined) {
        const previousUsage = this.currentUsage;

        // Update with real total usage and limit
        this.currentUsage = realData.totalUsage;
        if (realData.usageLimit !== undefined) {
          this.currentLimit = realData.usageLimit;
        }
        this.hasRealData = true;
        this.realDataSource = "augment_api";
        this.lastFetchedAt = new Date();
        if (realData.subscriptionType !== undefined) {
          this.subscriptionType = realData.subscriptionType;
        }
        if (realData.renewalDate !== undefined) {
          this.renewalDate = realData.renewalDate;
        }

        // A drop usually indicates a billing-cycle reset, so reset per-cycle alerts.
        if (realData.totalUsage < previousUsage) {
          await this.storageManager.resetAlertState();
        }

        SecureLogger.info("UsageTracker: Real data flags set", {
          hasRealData: this.hasRealData,
          currentUsage: this.currentUsage,
          currentLimit: this.currentLimit,
          realDataSource: this.realDataSource,
        });

        // Store the real data
        const data = await this.storageManager.getUsageData();
        data.totalUsage = realData.totalUsage;
        if (realData.lastUpdate) {
          data.lastUpdateDate = realData.lastUpdate;
        }
        await this.storageManager.saveUsageData(data);

        // Record snapshot for rate computation
        await this.storageManager.saveUsageSnapshot(
          realData.totalUsage,
          this.currentLimit > 0 ? this.currentLimit : undefined,
          this.realDataSource
        );
        await this.storageManager.cleanOldSnapshots(this.configManager.getHistoryRetentionDays());
        const providerSnapshot: ProviderUsageSnapshot = {
          providerId: "augment",
          timestamp: new Date().toISOString(),
          windowType: "monthly",
          metricType: "credits",
          sourceKind: "api",
          source: "augment_api",
          used: this.currentUsage,
          remaining: this.currentLimit > 0 ? Math.max(this.currentLimit - this.currentUsage, 0) : 0,
          percentUsed:
            this.currentLimit > 0 ? Math.round((this.currentUsage / this.currentLimit) * 100) : 0,
          confidence: 1,
        };
        if (this.currentLimit > 0) {
          providerSnapshot.limit = this.currentLimit;
        }
        if (this.renewalDate) {
          providerSnapshot.resetAt = this.renewalDate;
        }
        if (this.lastFetchedAt) {
          providerSnapshot.freshnessAt = this.lastFetchedAt.toISOString();
        }
        await this.storageManager.saveProviderUsageSnapshot(providerSnapshot);
        await this.storageManager.setProviderHealth({
          providerId: "augment",
          status: "connected",
          checkedAt: new Date().toISOString(),
          canCollectInCurrentWorkspace: true,
          sourceKind: "api",
          message: "Connected to Augment usage API.",
        });
        await this.storageManager.cleanOldProviderSnapshots(
          this.configManager.getHistoryRetentionDays()
        );

        // Check threshold notifications
        if (this.currentLimit > 0) {
          const percentage = Math.round((this.currentUsage / this.currentLimit) * 100);
          void this.checkThresholdNotifications(percentage);
        }

        this.onChangedEmitter.fire();
      } else if (realData.dailyUsage !== undefined) {
        // Update with daily usage increment
        const data = await this.storageManager.incrementUsage(realData.dailyUsage);
        this.currentUsage = data.totalUsage;
        this.hasRealData = true;
        this.realDataSource = "augment_daily";

        SecureLogger.info("UsageTracker: Daily usage data set", {
          hasRealData: this.hasRealData,
          currentUsage: this.currentUsage,
          realDataSource: this.realDataSource,
        });
        this.onChangedEmitter.fire();
      } else {
        SecureLogger.warn("UsageTracker: No valid usage data provided", realData);
      }
    } catch (error) {
      SecureLogger.warn("UsageTracker: Error updating with real data", error);
    }
  }

  private async checkThresholdNotifications(percentage: number): Promise<void> {
    try {
      const { warning, high, critical } = this.configManager.getAlertThresholds();
      const cycleId = this.getAlertCycleId();
      const lastNotified = await this.storageManager.getNotifiedThresholdForCycle(cycleId);

      const threshold = selectTriggeredThreshold(
        percentage,
        { warning, high, critical },
        lastNotified
      );

      if (threshold !== null) {
        await this.storageManager.setNotifiedThresholdForCycle(cycleId, threshold);
        const remaining = this.currentLimit > 0 ? this.currentLimit - this.currentUsage : 0;

        if (threshold >= critical) {
          void UserNotificationService.showWarning(
            `Augmeter: ${threshold}% of credits used. Only ${Math.max(0, remaining).toLocaleString()} remaining.`,
            {
              text: "View Usage",
              action: async () => {
                await vscode.commands.executeCommand("augmeter.manualRefresh");
              },
            }
          );
        } else {
          void UserNotificationService.showInfo(
            `Augmeter: ${threshold}% of credits used. ${Math.max(0, remaining).toLocaleString()} remaining.`
          );
        }
      }

      const runOutDays = this.configManager.getRunOutAlertDays();
      const projectedDays = await this.getProjectedDaysRemaining();
      const runOutAlreadyAlerted = await this.storageManager.isRunOutAlertedForCycle(cycleId);
      if (shouldNotifyProjectedRunOut(projectedDays, runOutDays, runOutAlreadyAlerted)) {
        const projectedDaysValue = projectedDays ?? 0;
        await this.storageManager.setRunOutAlertedForCycle(cycleId, true);
        void UserNotificationService.showWarning(
          `Augmeter: At current pace, credits may run out in ~${Math.max(1, Math.round(projectedDaysValue))} day(s).`,
          {
            text: "View Usage",
            action: async () => {
              await vscode.commands.executeCommand("augmeter.openUsageDashboard");
            },
          }
        );
      }
    } catch (error) {
      SecureLogger.warn("UsageTracker: Error checking threshold notifications", error);
    }
  }

  private getAlertCycleId(): string {
    return buildAlertCycleId(this.renewalDate);
  }

  // promptUserForRealData method removed - no longer needed since we eliminated popup dialogs

  async getTodayUsage(): Promise<number> {
    return await this.storageManager.getTodayUsage();
  }

  async refreshNow(): Promise<void> {
    try {
      this.nextFetchSource = "manual";
      SecureLogger.info("UsageTracker: refreshNow called", {
        hasRealDataFetcher: !!this.realDataFetcher,
        nextFetchSource: this.nextFetchSource,
      });
      if (this.realDataFetcher) {
        await this.realDataFetcher();
      } else {
        SecureLogger.warn("UsageTracker: No realDataFetcher available for refreshNow");
      }
    } catch (error) {
      SecureLogger.error("UsageTracker: Error during immediate refresh", error);
    }
  }

  async getWeeklyUsage(): Promise<number> {
    return await this.storageManager.getWeeklyUsage();
  }

  private async fetchRealUsageData(): Promise<void> {
    try {
      if (this.realDataFetcher) {
        await this.realDataFetcher();
      }
    } catch (error) {
      SecureLogger.error("UsageTracker: Error fetching real usage data", error);
    }
  }

  private getJitteredIntervalMs(): number {
    // Lengthen the polling cadence while the editor window is unfocused so a
    // backgrounded editor does not keep hitting the API at full speed.
    const multiplier = this.windowFocused ? 1 : this.configManager.getBackgroundMultiplier();
    const base = this.configManager.getRefreshInterval() * 1000 * multiplier;
    const jitterFactor = 0.2; // +/- 20%
    const min = base * (1 - jitterFactor);
    const max = base * (1 + jitterFactor);
    return Math.floor(min + this.randomFn() * (max - min));
  }

  /**
   * Update window focus state. On a transition the poller is rescheduled so the
   * effective interval reflects the new state: blurring lengthens the next
   * interval (by the configured background multiplier) and focusing shortens it
   * back. The active poll loop is only rescheduled; manual/focus refreshes are
   * untouched. Has no effect if the focus state is unchanged.
   */
  setWindowFocused(focused: boolean): void {
    if (this.windowFocused === focused) {
      return;
    }
    this.windowFocused = focused;
    // Only reschedule when the self-rescheduling poll loop is active; do not
    // resurrect timers when polling has been stopped/disabled.
    if (this.pollTimeout) {
      this.scheduleNextFetch(this.getJitteredIntervalMs(), "focus-change");
    }
  }

  /** Whether the editor window is currently considered focused. */
  isWindowFocused(): boolean {
    return this.windowFocused;
  }

  private scheduleNextFetch(delayMs: number, source: string = "poller"): void {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    if (this.disposed) {
      return;
    }
    this.nextFetchSource = source;
    this.pollTimeout = setTimeout(async () => {
      if (this.disposed) {
        return;
      }
      await this.fetchRealUsageData();
      if (this.disposed) {
        return;
      }
      this.scheduleNextFetch(this.getJitteredIntervalMs(), "poller");
    }, delayMs);
  }

  triggerRefreshSoon(minDelayMs: number = 0, source: string = "poller"): void {
    const delay = Math.max(0, minDelayMs);
    this.scheduleNextFetch(delay, source);
  }

  getFetchSource(): string {
    return this.nextFetchSource || "poller";
  }

  setRealDataFetcher(fetcher: (() => Promise<void>) | null): void {
    this.realDataFetcher = fetcher;
  }

  clearRealDataFlag(): void {
    this.hasRealData = false;
    this.realDataSource = "no_data";
    this.currentUsage = 0;
    this.currentLimit = 0;
    this.subscriptionType = undefined;
    this.renewalDate = undefined;
    this.lastFetchedAt = undefined;
    this.onChangedEmitter.fire();
  }

  stopDataFetching(): void {
    // Do not clear the fetcher; only stop timers and reset data
    this.clearRealDataFlag();

    // Clear intervals when stopping data fetching
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // Allow a later startTracking() (e.g. on re-enable) to start cleanly.
    this.tracking = false;

    this.onChangedEmitter.fire();
  }

  dispose(): void {
    this.disposed = true;
    this.tracking = false;

    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    // Clear all intervals to prevent memory leaks
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];

    // Clear the self-rescheduling poll timer so we don't keep the event loop
    // (and the captured configManager / storageManager closures) alive after
    // deactivation or unit-test teardown.
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    this.realDataFetcher = null;
    this.onChangedEmitter.dispose();
  }
}
