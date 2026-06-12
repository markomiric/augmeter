import type * as vscode from "vscode";
import { AugmentApiClient } from "./augment-api-client";

export class AugmentDetector {
  private readonly apiClient: AugmentApiClient;

  constructor(context?: vscode.ExtensionContext, resolveApiBaseUrl?: () => string) {
    this.apiClient = new AugmentApiClient(context, resolveApiBaseUrl);
  }

  getApiClient(): AugmentApiClient {
    return this.apiClient;
  }

  async testApiConnection(): Promise<{
    success: boolean;
    error?: string | undefined;
    hasToken: boolean;
  }> {
    const hasToken = this.apiClient.hasCookie();

    if (!hasToken) {
      return {
        success: false,
        error: "No authentication cookie provided" as string | undefined,
        hasToken: false,
      };
    }

    const testResult = await this.apiClient.testConnection();
    return {
      success: testResult.success,
      error: testResult.error ?? undefined,
      hasToken: true,
    };
  }

  clearAuthCache(): void {
    // No cached detector state remains, but callers still use this as a lifecycle seam.
  }

  hasApiCookie(): boolean {
    return this.apiClient.hasCookie();
  }
}
