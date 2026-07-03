import type * as vscode from "vscode";
import { toRoundedNumber } from "./config-value-utils";

export interface AlertThresholdConfig {
  warning: number;
  high: number;
  critical: number;
}

export class AlertConfigSection {
  constructor(private readonly config: vscode.WorkspaceConfiguration) {}

  getHistoryRetentionDays(): number {
    const raw = this.config.get<number>("history.retentionDays", 35);
    const value = toRoundedNumber(raw, 35);
    if (value < 7) return 7;
    if (value > 90) return 90;
    return value;
  }

  getAlertThresholds(): AlertThresholdConfig {
    const warningRaw = this.config.get<number>("alerts.warningPercent", 75);
    const highRaw = this.config.get<number>("alerts.highPercent", 90);
    const criticalRaw = this.config.get<number>("alerts.criticalPercent", 95);

    const warning = Math.max(50, Math.min(99, toRoundedNumber(warningRaw, 75)));
    const high = Math.max(warning + 1, Math.min(99, toRoundedNumber(highRaw, 90)));
    const critical = Math.max(high + 1, Math.min(100, toRoundedNumber(criticalRaw, 95)));

    return { warning, high, critical };
  }

  getRunOutAlertDays(): number {
    const raw = this.config.get<number>("alerts.runOutDays", 3);
    const value = toRoundedNumber(raw, 3);
    if (value < 0) return 0;
    if (value > 30) return 30;
    return value;
  }

  getMonthlyTarget(): number {
    const raw = this.config.get<number>("budget.monthlyTarget", 0);
    return Math.max(0, toRoundedNumber(raw, 0));
  }
}
