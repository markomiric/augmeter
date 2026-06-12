import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../../providers/provider-registry";
import { type ProviderAdapter } from "../../providers/provider-adapter";
import { type ProviderUsageSnapshot } from "../../core/types/provider-usage";

function makeSnapshot(providerId: string): ProviderUsageSnapshot {
  return {
    providerId,
    timestamp: new Date().toISOString(),
    windowType: "daily",
    metricType: "messages",
    sourceKind: "derived",
    used: 10,
  };
}

function makeAdapter(id: string, supportsUntrustedWorkspaces?: boolean): ProviderAdapter {
  const adapter: ProviderAdapter = {
    id,
    displayName: id.toUpperCase(),
    ...(supportsUntrustedWorkspaces !== undefined ? { supportsUntrustedWorkspaces } : {}),
    collectUsage: async () => ({
      snapshots: [makeSnapshot(id)],
      health: {
        providerId: id,
        status: "connected",
        checkedAt: new Date().toISOString(),
        canCollectInCurrentWorkspace: true,
      },
    }),
  };
  return adapter;
}

describe("ProviderRegistry", () => {
  it("registers and retrieves adapters", () => {
    const registry = new ProviderRegistry();
    const augment = makeAdapter("augment");
    registry.register(augment);

    expect(registry.get("augment")).toBe(augment);
    expect(registry.getAll()).toHaveLength(1);
  });

  it("filters by enabled provider IDs", () => {
    const registry = new ProviderRegistry([makeAdapter("augment"), makeAdapter("claude")]);

    const enabled = registry.getEnabled({
      enabledProviderIds: ["claude"],
      workspaceTrusted: true,
    });

    expect(enabled).toHaveLength(1);
    expect(enabled[0]?.id).toBe("claude");
  });

  it("filters adapters in untrusted mode unless explicitly supported", () => {
    const registry = new ProviderRegistry([
      makeAdapter("augment"),
      makeAdapter("copilot", true),
      makeAdapter("claude"),
    ]);

    const enabled = registry.getEnabled({ workspaceTrusted: false });

    expect(enabled).toHaveLength(1);
    expect(enabled[0]?.id).toBe("copilot");
  });
});
