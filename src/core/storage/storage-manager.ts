/**
 * ABOUTME: This file manages persistent storage of usage data using VS Code's workspace state,
 * including daily usage tracking and automatic cleanup of old data.
 */
import type * as vscode from "vscode";

/**
 * Usage data stored in VS Code workspace state.
 */
export interface UsageData {
  totalUsage: number;
  dailyUsage: { [date: string]: number };
  lastResetDate: string;
  lastUpdateDate: string;
}

/**
 * A timestamped credit consumption snapshot for rate computation.
 */
export interface UsageSnapshot {
  timestamp: string; // ISO 8601
  consumed: number;
  limit?: number;
  source?: string;
}

/**
 * Manages persistent storage of usage data.
 *
 * This class provides:
 * - Daily usage tracking with automatic date-based keys
 * - Total usage accumulation
 * - Automatic cleanup of data older than 30 days
 * - Thread-safe increment operations
 *
 * @example
 * ```typescript
 * const storage = new StorageManager(context);
 * await storage.incrementUsage(5);
 * const data = await storage.getUsageData();
 * ```
 */
export class StorageManager {
  private context: vscode.ExtensionContext;
  private readonly STORAGE_KEY = "augmentUsageData";
  private readonly THRESHOLD_KEY = "augmentLastNotifiedThreshold";
  private readonly ALERT_STATE_KEY = "augmentAlertState";
  private readonly SNAPSHOTS_KEY = "augmentUsageSnapshots";

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async getUsageData(): Promise<UsageData> {
    const defaultData: UsageData = {
      totalUsage: 0,
      dailyUsage: {},
      lastResetDate: new Date().toISOString(),
      lastUpdateDate: new Date().toISOString(),
    };

    const stored = this.context.globalState.get<UsageData>(this.STORAGE_KEY);
    return stored || defaultData;
  }

  async saveUsageData(data: UsageData): Promise<void> {
    data.lastUpdateDate = new Date().toISOString();
    await this.context.globalState.update(this.STORAGE_KEY, data);
  }

  async incrementUsage(amount: number = 1): Promise<UsageData> {
    const data = await this.getUsageData();
    const today = new Date().toISOString().split("T")[0];
    if (!today) {
      throw new Error("Failed to get today's date");
    }

    data.totalUsage += amount;
    data.dailyUsage[today] = (data.dailyUsage[today] ?? 0) + amount;

    await this.saveUsageData(data);
    return data;
  }

  async resetUsage(): Promise<void> {
    const data: UsageData = {
      totalUsage: 0,
      dailyUsage: {},
      lastResetDate: new Date().toISOString(),
      lastUpdateDate: new Date().toISOString(),
    };

    await this.saveUsageData(data);
  }

  async getTodayUsage(): Promise<number> {
    const data = await this.getUsageData();
    const today = new Date().toISOString().split("T")[0];
    if (!today) {
      return 0;
    }
    return data.dailyUsage[today] ?? 0;
  }

  async getWeeklyUsage(): Promise<number> {
    const data = await this.getUsageData();
    const now = new Date();
    let weeklyTotal = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      if (dateStr) {
        weeklyTotal += data.dailyUsage[dateStr] ?? 0;
      }
    }

    return weeklyTotal;
  }

  async getLastNotifiedThreshold(): Promise<number> {
    return this.context.globalState.get<number>(this.THRESHOLD_KEY, 0);
  }

  async setLastNotifiedThreshold(threshold: number): Promise<void> {
    await this.context.globalState.update(this.THRESHOLD_KEY, threshold);
  }

  async getNotifiedThresholdForCycle(cycleId: string): Promise<number> {
    const state = await this.getAlertState();
    return state.cycleId === cycleId ? state.lastThreshold : 0;
  }

  async setNotifiedThresholdForCycle(cycleId: string, threshold: number): Promise<void> {
    const state = await this.getAlertState();
    await this.context.globalState.update(this.ALERT_STATE_KEY, {
      cycleId,
      lastThreshold: threshold,
      runOutAlerted: state.cycleId === cycleId ? state.runOutAlerted : false,
    });
  }

  async isRunOutAlertedForCycle(cycleId: string): Promise<boolean> {
    const state = await this.getAlertState();
    return state.cycleId === cycleId ? state.runOutAlerted : false;
  }

  async setRunOutAlertedForCycle(cycleId: string, alerted: boolean): Promise<void> {
    const state = await this.getAlertState();
    await this.context.globalState.update(this.ALERT_STATE_KEY, {
      cycleId,
      lastThreshold: state.cycleId === cycleId ? state.lastThreshold : 0,
      runOutAlerted: alerted,
    });
  }

  async resetAlertState(): Promise<void> {
    await this.context.globalState.update(this.THRESHOLD_KEY, 0);
    await this.context.globalState.update(this.ALERT_STATE_KEY, {
      cycleId: "",
      lastThreshold: 0,
      runOutAlerted: false,
    });
  }

  async cleanOldData(): Promise<void> {
    const data = await this.getUsageData();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep 30 days of data

    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    if (!cutoffStr) {
      return; // Cannot determine cutoff date
    }

    for (const date in data.dailyUsage) {
      if (date < cutoffStr) {
        delete data.dailyUsage[date];
      }
    }

    await this.saveUsageData(data);
  }

  async saveUsageSnapshot(consumed: number, limit?: number, source?: string): Promise<void> {
    const snapshots = await this.getUsageSnapshots();
    const snapshot: UsageSnapshot = {
      timestamp: new Date().toISOString(),
      consumed,
    };
    if (limit !== undefined) {
      snapshot.limit = limit;
    }
    if (source !== undefined) {
      snapshot.source = source;
    }
    snapshots.push(snapshot);
    await this.context.globalState.update(this.SNAPSHOTS_KEY, snapshots);
  }

  async getUsageSnapshots(): Promise<UsageSnapshot[]> {
    return this.context.globalState.get<UsageSnapshot[]>(this.SNAPSHOTS_KEY) || [];
  }

  async cleanOldSnapshots(retentionDays: number = 35): Promise<void> {
    const snapshots = await this.getUsageSnapshots();
    const safeDays = Math.max(7, Math.min(90, Math.round(retentionDays)));
    const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1000;
    const filtered = snapshots.filter(s => new Date(s.timestamp).getTime() >= cutoff);
    if (filtered.length !== snapshots.length) {
      await this.context.globalState.update(this.SNAPSHOTS_KEY, filtered);
    }
  }

  async clearSnapshots(): Promise<void> {
    await this.context.globalState.update(this.SNAPSHOTS_KEY, []);
  }

  private async getAlertState(): Promise<{
    cycleId: string;
    lastThreshold: number;
    runOutAlerted: boolean;
  }> {
    return (
      this.context.globalState.get<{
        cycleId: string;
        lastThreshold: number;
        runOutAlerted: boolean;
      }>(this.ALERT_STATE_KEY) || {
        cycleId: "",
        lastThreshold: 0,
        runOutAlerted: false,
      }
    );
  }
}
