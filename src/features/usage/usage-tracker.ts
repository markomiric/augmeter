/**
 * ABOUTME: This file tracks usage data, manages polling intervals, and emits change events
 * when usage data is updated from the API or local storage.
 */
import * as vscode from "vscode";
import { type StorageManager, type UsageSnapshot } from "../../core/storage/storage-manager";
import { type ConfigManager } from "../../core/config/config-manager";
import { SecureLogger } from "../../core/logging/secure-logger";
import { UserNotificationService } from "../../core/notifications/user-notification-service";
import { SessionReader, type SessionActivity } from "../../services/session-reader";

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
  private nextFetchSource: string = "poller";
  private subscriptionType: string | undefined;
  private renewalDate: string | undefined;
  private lastFetchedAt: Date | undefined;
  private onChangedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onChanged: vscode.Event<void> = this.onChangedEmitter.event;

  constructor(storageManager: StorageManager, configManager: ConfigManager) {
    this.storageManager = storageManager;
    this.configManager = configManager;
    void this.loadCurrentUsage();
  }

  private static readonly NOTIFICATION_THRESHOLDS = [95, 90, 75] as const;

  private async loadCurrentUsage() {
    const data = await this.storageManager.getUsageData();
    this.currentUsage = data.totalUsage;
    this.lastResetDate = data.lastResetDate;
  }

  startTracking() {
    if (!this.configManager.isEnabled()) {
      return;
    }

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

  async resetUsage() {
    await this.storageManager.resetUsage();
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
    return UsageTracker.computeProjectedDays(remaining, rate);
  }

  /**
   * Pure, static projection computation for testability.
   */
  static computeProjectedDays(remaining: number, ratePerHour: number | null): number | null {
    if (ratePerHour === null || ratePerHour <= 0) return null;
    return remaining / (ratePerHour * 24);
  }

  /**
   * Get today's session activity (prompts/sessions) from local Augment session files.
   * Returns null if session tracking is disabled or on error.
   */
  getSessionActivity(): SessionActivity | null {
    try {
      if (!this.configManager.isSessionTrackingEnabled()) return null;
      const reader = new SessionReader(this.configManager.getSessionTrackingPath() || undefined);
      return reader.getTodayActivity();
    } catch {
      return null;
    }
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
        await this.storageManager.saveUsageSnapshot(realData.totalUsage);
        await this.storageManager.cleanOldSnapshots();

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
      const lastNotified = await this.storageManager.getLastNotifiedThreshold();

      for (const threshold of UsageTracker.NOTIFICATION_THRESHOLDS) {
        if (percentage >= threshold && lastNotified < threshold) {
          await this.storageManager.setLastNotifiedThreshold(threshold);
          const remaining = this.currentLimit > 0 ? this.currentLimit - this.currentUsage : 0;

          if (threshold >= 95) {
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
          break; // Only notify for the highest crossed threshold
        }
      }
    } catch (error) {
      SecureLogger.warn("UsageTracker: Error checking threshold notifications", error);
    }
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
    const base = this.configManager.getRefreshInterval() * 1000;
    const jitterFactor = 0.2; // +/- 20%
    const min = base * (1 - jitterFactor);
    const max = base * (1 + jitterFactor);
    return Math.floor(min + Math.random() * (max - min));
  }

  private scheduleNextFetch(delayMs: number, source: string = "poller") {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    this.nextFetchSource = source;
    this.pollTimeout = setTimeout(async () => {
      await this.fetchRealUsageData();
      this.scheduleNextFetch(this.getJitteredIntervalMs(), "poller");
    }, delayMs);
  }

  triggerRefreshSoon(minDelayMs: number = 0, source: string = "poller") {
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

    this.onChangedEmitter.fire();
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    // Clear all intervals to prevent memory leaks
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];

    this.realDataFetcher = null;
    this.onChangedEmitter.dispose();
  }
}
