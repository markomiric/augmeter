/**
 * ABOUTME: Adapter contract for provider-specific usage collectors.
 */
import {
  type ProviderHealthSnapshot,
  type ProviderId,
  type ProviderUsageSnapshot,
} from "../core/types/provider-usage";

export interface ProviderCollectionContext {
  now: Date;
  workspaceTrusted: boolean;
  forceRefresh?: boolean;
}

export interface ProviderAdapterResult {
  snapshots: ProviderUsageSnapshot[];
  health: ProviderHealthSnapshot;
}

/**
 * Provider adapters collect data from one source and normalize into shared contracts.
 */
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly supportsUntrustedWorkspaces?: boolean;
  collectUsage(context: ProviderCollectionContext): Promise<ProviderAdapterResult>;
}
