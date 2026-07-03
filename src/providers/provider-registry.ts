/**
 * ABOUTME: Runtime registry for provider adapters with trust-aware filtering.
 */
import { type ProviderId } from "../core/types/provider-usage";
import { type ProviderAdapter } from "./provider-adapter";

export interface RegistryFilterOptions {
  enabledProviderIds?: ProviderId[];
  workspaceTrusted?: boolean;
}

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderId, ProviderAdapter>();

  constructor(initialAdapters: ProviderAdapter[] = []) {
    for (const adapter of initialAdapters) {
      this.register(adapter);
    }
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(providerId: ProviderId): ProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getAll(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getEnabled(options: RegistryFilterOptions = {}): ProviderAdapter[] {
    const { enabledProviderIds, workspaceTrusted = true } = options;
    const enabledSet = enabledProviderIds ? new Set(enabledProviderIds) : null;

    return this.getAll().filter(adapter => {
      if (enabledSet && !enabledSet.has(adapter.id)) {
        return false;
      }
      if (!workspaceTrusted && adapter.supportsUntrustedWorkspaces !== true) {
        return false;
      }
      return true;
    });
  }
}
