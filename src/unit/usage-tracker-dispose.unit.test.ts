/**
 * Regression test for UsageTracker dispose cleanup. The poll loop self-reschedules
 * via setTimeout; before the fix dispose() left the timer armed, so the closure
 * (and captured config/storage references) outlived the extension host.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Extend the vscode mock from test-setup with EventEmitter, which UsageTracker
// constructs at instance-init time.
vi.mock("vscode", async () => {
  type Listener = () => void;
  class EventEmitter<T> {
    private listeners: Array<(value: T) => void> = [];
    public event = (listener: (value: T) => void): { dispose: () => void } => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    public fire(value: T): void {
      for (const l of this.listeners) l(value);
    }
    public dispose(): void {
      this.listeners = [];
    }
  }
  void ({} as Listener);
  return {
    EventEmitter,
    workspace: { getConfiguration: () => ({ get: (_: string, d: unknown) => d }) },
    window: {
      createOutputChannel: () => ({ appendLine: () => {}, dispose: () => {} }),
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => undefined,
    },
    commands: { registerCommand: () => ({ dispose: () => {} }), executeCommand: async () => {} },
    env: { clipboard: { readText: async () => "", writeText: async () => {} } },
    Uri: { parse: (s: string) => ({ toString: () => String(s) }) },
    ThemeColor: class {},
  };
});

import { UsageTracker } from "../features/usage/usage-tracker";
import type { ConfigManager } from "../core/config/config-manager";
import type { StorageManager } from "../core/storage/storage-manager";

function makeStorageStub(): StorageManager {
  return {
    getUsageData: vi.fn(async () => ({
      totalUsage: 0,
      lastResetDate: new Date().toISOString(),
      lastUpdateDate: "",
      dailyHistory: {},
    })),
    cleanOldData: vi.fn(async () => {}),
  } as unknown as StorageManager;
}

function makeConfigStub(enabled: boolean = true): ConfigManager {
  return {
    isEnabled: vi.fn(() => enabled),
    getRefreshInterval: vi.fn(() => 60), // seconds
    isSessionTrackingEnabled: vi.fn(() => false),
    getSessionTrackingPath: vi.fn(() => ""),
  } as unknown as ConfigManager;
}

describe("UsageTracker.dispose()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the polling timer and stops rescheduling after dispose", () => {
    const storage = makeStorageStub();
    const config = makeConfigStub(true);

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const tracker = new UsageTracker(storage, config);
    tracker.startTracking();

    // startTracking schedules an immediate poll via setTimeout(..., 0)
    expect(setTimeoutSpy).toHaveBeenCalled();
    const scheduledCallsBeforeDispose = setTimeoutSpy.mock.calls.length;

    tracker.dispose();

    // dispose must clear the pending poll timer
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // Advancing time must not arm any new poll timer
    vi.advanceTimersByTime(60_000);
    vi.advanceTimersByTime(60_000);

    expect(setTimeoutSpy.mock.calls.length).toBe(scheduledCallsBeforeDispose);
  });

  it("scheduleNextFetch is a no-op once disposed (triggerRefreshSoon ignored)", () => {
    const storage = makeStorageStub();
    const config = makeConfigStub(true);

    const tracker = new UsageTracker(storage, config);
    tracker.dispose();

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    tracker.triggerRefreshSoon(0, "manual");

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it("does not restart polling or fetch manually after collection is paused", async () => {
    const config = makeConfigStub(true);
    const tracker = new UsageTracker(makeStorageStub(), config);
    let finish!: (value: boolean) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          finish = resolve;
        })
    );
    tracker.setRealDataFetcher(fetcher);
    tracker.startTracking();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledOnce();
    vi.mocked(config.isEnabled).mockReturnValue(false);
    tracker.stopDataFetching();
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    tracker.triggerRefreshSoon(0, "focus");
    expect(await tracker.refreshNow()).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    tracker.dispose();
  });
});
