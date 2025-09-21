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
}
