import * as vscode from "vscode";
import { StorageManager } from "../../core/storage/storage-manager";
import { ConfigManager } from "../../core/config/config-manager";
import { SecureLogger } from "../../core/logging/secure-logger";

export interface RealUsageData {
  totalUsage?: number;
  usageLimit?: number;
  dailyUsage?: number;
  lastUpdate?: string;
}

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
  private onChangedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onChanged: vscode.Event<void> = this.onChangedEmitter.event;

  constructor(storageManager: StorageManager, configManager: ConfigManager) {
    this.storageManager = storageManager;
    this.configManager = configManager;
    this.loadCurrentUsage();
  }

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
        this.storageManager.cleanOldData();
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
