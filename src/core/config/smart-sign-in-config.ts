import type * as vscode from "vscode";

export interface SmartSignInConfig {
  quickWatchMs: number;
  websiteWatchMs: number;
}

export class SmartSignInConfigSection {
  constructor(private readonly config: vscode.WorkspaceConfiguration) {}

  getQuickWatchMs(): number {
    const raw = this.config.get<number>("smartSignIn.quickWatchMs", 2000);
    const value = this.toRoundedNumber(raw, 2000);
    if (value < 0) return 0;
    if (value > 5000) return 5000;
    return value;
  }

  getWebsiteWatchMs(): number {
    const raw = this.config.get<number>("smartSignIn.websiteWatchMs", 300000);
    const value = this.toRoundedNumber(raw, 300000);
    if (value < 1000) return 1000;
    if (value > 300000) return 300000;
    return value;
  }

  getConfig(): SmartSignInConfig {
    return {
      quickWatchMs: this.getQuickWatchMs(),
      websiteWatchMs: this.getWebsiteWatchMs(),
    };
  }

  private toRoundedNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }
    return fallback;
  }
}
