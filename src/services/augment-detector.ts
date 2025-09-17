import * as vscode from "vscode";
import { AugmentApiClient } from "./augment-api-client";
import { AugmentUsageData } from "../core/types/augment";
import { SecureLogger } from "../core/logging/secure-logger";

export interface AugmentStatus {
  installed: boolean;
  active: boolean;
  version?: string;
  hasRealData: boolean;
}

export class AugmentDetector {
  private readonly AUGMENT_EXTENSION_ID = "augment.vscode-augment";
  private lastDetectionTime: number = 0;
  private cachedStatus: AugmentStatus | null = null;
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private apiClient: AugmentApiClient;

  constructor(context?: vscode.ExtensionContext) {
    this.apiClient = new AugmentApiClient(context);
  }

  getApiClient(): AugmentApiClient {
    return this.apiClient;
  }

  async getAugmentStatus(): Promise<AugmentStatus> {
    // Use cached result if still valid
    const now = Date.now();
    if (this.cachedStatus && now - this.lastDetectionTime < this.CACHE_DURATION) {
      return this.cachedStatus;
    }

    const extension = vscode.extensions.getExtension(this.AUGMENT_EXTENSION_ID);
    const installed = extension !== undefined;
    const active = extension?.isActive || false;
    const version = extension?.packageJSON?.version;

    let hasRealData = false;

    hasRealData = false;

    const status: AugmentStatus = {
      installed,
      active,
      version,
      hasRealData,
    };

    // Cache the result
    this.cachedStatus = status;
    this.lastDetectionTime = now;

    return status;
  }

  // API-related methods
  clearAuthCache(): void {
    // Clear cache to force re-detection with new auth
    this.cachedStatus = null;
  }

  async testApiConnection(): Promise<{
    success: boolean;
    error?: string;
    hasToken: boolean;
  }> {
    const hasToken = this.apiClient.hasCookie();

    if (!hasToken) {
      return {
        success: false,
        error: "No authentication cookie provided",
        hasToken: false,
      };
    }

    const testResult = await this.apiClient.testConnection();
    return {
      success: testResult.success,
      error: testResult.error,
      hasToken: true,
    };
  }

  async getApiUsageData(): Promise<AugmentUsageData | null> {
    if (!this.apiClient.hasCookie()) {
      return null;
    }

    try {
      const response = await this.apiClient.getUsageData();
      if (response.success) {
        return await this.apiClient.parseUsageResponse(response);
      }
    } catch (error) {
      // Do not throw; detection should not break UX
      SecureLogger.warn("AugmentDetector: Error getting API usage data", error);
    }

    return null;
  }

  clearApiCookie(): void {
    this.apiClient.clearSessionCookie();
    this.cachedStatus = null;
  }

  hasApiCookie(): boolean {
    return this.apiClient.hasCookie();
  }
}
