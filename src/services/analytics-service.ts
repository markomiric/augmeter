import * as vscode from "vscode";
import { AugmentApiClient } from "./augment-api-client";
import { SecureLogger } from "../core/logging/secure-logger";
import { ConfigManager } from "../core/config/config-manager";

export interface AnalyticsEvent {
  event: string;
  ts: string; // ISO timestamp
  properties?: Record<string, any>;
}

export class AnalyticsService {
  private context: vscode.ExtensionContext;
  private apiClient: AugmentApiClient; // retained for future use (no network calls now)
  private config: ConfigManager;
  private disabledForSession = false;

  constructor(
    context: vscode.ExtensionContext,
    apiClient: AugmentApiClient,
    config: ConfigManager
  ) {
    this.context = context;
    this.apiClient = apiClient;
    this.config = config;
  }

  isEnabled(): boolean {
    // Respect VS Code telemetry preference as an additional guard
    const vscodeTelemetryEnabled =
      vscode.env.isTelemetryEnabled === undefined ? true : vscode.env.isTelemetryEnabled;

    // Analytics now enabled if extension enabled AND VS Code telemetry allows it
    return this.config.isEnabled() && !!vscodeTelemetryEnabled;
  }

  async track(_event: string, _properties?: Record<string, any>): Promise<void> {
    // No-op: usage/events endpoint removed. We intentionally do not send analytics over network.
    try {
      if (!this.isEnabled()) return;
      // Optionally log locally for debugging without network calls
      SecureLogger.info("Analytics (no-op)");
    } catch {
      // ignore
    }
  }
}
