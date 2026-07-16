import type * as vscode from "vscode";
import { describe, expect, it } from "vitest";
import { StorageManager } from "../../core/storage/storage-manager";
import {
  type ProviderHealthSnapshot,
  type ProviderUsageSnapshot,
} from "../../core/types/provider-usage";

function createMockContext(): vscode.ExtensionContext {
  const state = new Map<string, unknown>();

  const globalState = {
    get<T>(key: string, defaultValue?: T): T | undefined {
      if (!state.has(key)) {
        return defaultValue;
      }
      return state.get(key) as T;
    },
    async update(key: string, value: unknown): Promise<void> {
      state.set(key, value);
    },
    setKeysForSync(): void {},
    keys(): readonly string[] {
      return Array.from(state.keys());
    },
  };

  return {
    globalState,
  } as unknown as vscode.ExtensionContext;
}

function makeProviderSnapshot(providerId: string, timestamp?: string): ProviderUsageSnapshot {
  return {
    providerId,
    timestamp: timestamp || new Date().toISOString(),
    windowType: "daily",
    metricType: "messages",
    sourceKind: "derived",
    used: 10,
  };
}

function makeProviderHealth(providerId: string): ProviderHealthSnapshot {
  return {
    providerId,
    status: "connected",
    checkedAt: new Date().toISOString(),
    canCollectInCurrentWorkspace: true,
  };
}

describe("StorageManager provider storage", () => {
  it("saves and filters provider snapshots", async () => {
    const storage = new StorageManager(createMockContext());
    await storage.saveProviderUsageSnapshot(makeProviderSnapshot("augment"));
    await storage.saveProviderUsageSnapshot(makeProviderSnapshot("claude"));

    const all = await storage.getProviderUsageSnapshots();
    const augment = await storage.getProviderUsageSnapshots("augment");

    expect(all).toHaveLength(2);
    expect(augment).toHaveLength(1);
    expect(augment[0]?.providerId).toBe("augment");
  });

  it("ignores invalid provider snapshots during save/get normalization", async () => {
    const storage = new StorageManager(createMockContext());
    await storage.saveProviderUsageSnapshot(makeProviderSnapshot("augment"));
    await storage.saveProviderUsageSnapshot({ providerId: "claude" } as any);

    const all = await storage.getProviderUsageSnapshots();
    expect(all).toHaveLength(1);
    expect(all[0]?.providerId).toBe("augment");
  });

  it("cleans provider snapshots by retention window", async () => {
    const storage = new StorageManager(createMockContext());
    const now = Date.now();
    const old = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    await storage.saveProviderUsageSnapshots([
      makeProviderSnapshot("augment", old),
      makeProviderSnapshot("augment", recent),
    ]);

    await storage.cleanOldProviderSnapshots(35);
    const all = await storage.getProviderUsageSnapshots();
    expect(all).toHaveLength(1);
    expect(all[0]?.timestamp).toBe(recent);
  });

  it("stores and clears provider health snapshots", async () => {
    const storage = new StorageManager(createMockContext());
    await storage.setProviderHealth(makeProviderHealth("augment"));
    await storage.setProviderHealth({
      providerId: "claude",
      status: "degraded",
      checkedAt: new Date().toISOString(),
      canCollectInCurrentWorkspace: false,
      message: "Missing local files",
    });

    const one = await storage.getProviderHealth("augment");
    const all = await storage.getAllProviderHealth();
    expect(one?.status).toBe("connected");
    expect(all).toHaveLength(2);

    await storage.clearProviderHealth();
    expect(await storage.getAllProviderHealth()).toHaveLength(0);
  });
});
