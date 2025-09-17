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
  private apiClient: AugmentApiClient;
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

  async track(event: string, properties?: Record<string, any>): Promise<void> {
    try {
      if (this.disabledForSession) return;
      if (!this.isEnabled()) return;
      if (!this.apiClient.hasCookie()) return; // require session cookie auth

      const payload: AnalyticsEvent = {
        event,
        ts: new Date().toISOString(),
        properties: {
          ...properties,
          ide: { name: "VSCode", version: vscode.version },
          extension: { version: this.context.extension.packageJSON.version },
          os: { platform: process.platform, arch: process.arch },
        },
      };

      // Send via tenant-authenticated API; endpoint may not exist yet -> handle gracefully
      const resp = await this.apiClient.sendUsageEvents([payload]);
      if (!resp.success) {
        if ((resp as any).status === 404) {
          this.disabledForSession = true;
          SecureLogger.info(
            "Analytics endpoint not available (404). Disabling analytics for this session."
          );
        } else {
          SecureLogger.warn("Analytics event send failed", resp.error || "unknown error");
        }
      }
    } catch (error) {
      // Do not throw; analytics should never break UX
      SecureLogger.warn("Analytics track error", error);
    }
  }
}
