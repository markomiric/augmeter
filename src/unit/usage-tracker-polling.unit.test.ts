import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { UsageTracker } from "../features/usage/usage-tracker";
import type { StorageManager } from "../core/storage/storage-manager";
import type { ConfigManager } from "../core/config/config-manager";

/**
 * These tests exercise the focus-aware polling cadence: while the editor window
 * is unfocused the self-rescheduling poller must lengthen its interval by the
 * configured background multiplier instead of polling the API at full speed.
 *
 * Randomness (jitter) is pinned via the injected randomFn so delays are
 * deterministic, and setTimeout is captured to observe the scheduled delays.
 */
describe("UsageTracker focus-aware polling", () => {
  const REFRESH_SECONDS = 60;
  const BACKGROUND_MULTIPLIER = 5;
  // randomFn = 0 collapses jitter to the lower bound: base * (1 - 0.2) = base * 0.8
  const JITTER_AT_ZERO = 0.8;

  let storageManager: StorageManager;
  let configManager: ConfigManager;
  let scheduledDelays: number[];
  let originalSetTimeout: typeof setTimeout;

  function foregroundDelayMs(): number {
    return Math.floor(REFRESH_SECONDS * 1000 * JITTER_AT_ZERO);
  }

  function backgroundDelayMs(): number {
    return Math.floor(REFRESH_SECONDS * 1000 * BACKGROUND_MULTIPLIER * JITTER_AT_ZERO);
  }

  beforeEach(() => {
    scheduledDelays = [];

    storageManager = {
      getUsageData: vi.fn(async () => ({ totalUsage: 0, lastResetDate: "" })),
      cleanOldData: vi.fn(async () => {}),
    } as unknown as StorageManager;

    configManager = {
      isEnabled: vi.fn(() => true),
      getRefreshInterval: vi.fn(() => REFRESH_SECONDS),
      getBackgroundMultiplier: vi.fn(() => BACKGROUND_MULTIPLIER),
    } as unknown as ConfigManager;

    // Capture only the timeouts the poll loop schedules (it passes a number
    // delay). We intentionally do not fire them so the loop does not recurse;
    // we only assert on the delays chosen.
    originalSetTimeout = globalThis.setTimeout;
    scheduledDelays = [];
    globalThis.setTimeout = ((_handler: (...cbArgs: unknown[]) => void, delay?: number) => {
      if (typeof delay === "number") {
        scheduledDelays.push(delay);
      }
      // Return a sentinel; the production code stores it but we never run it.
      return originalSetTimeout(() => {}, 0) as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout;
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout;
  });

  it("defaults to focused", () => {
    const tracker = new UsageTracker(storageManager, configManager, () => 0);
    expect(tracker.isWindowFocused()).toBe(true);
    tracker.dispose();
  });

  it("schedules at the foreground cadence while focused", () => {
    const tracker = new UsageTracker(storageManager, configManager, () => 0);
    // Trigger a poll-loop reschedule (source "poller") and inspect the delay.
    tracker.triggerRefreshSoon(0, "poller");
    scheduledDelays.length = 0;
    // Force a reschedule using the jittered interval by toggling focus twice
    // back to focused: first blur (reschedules background), then focus.
    tracker.setWindowFocused(false);
    tracker.setWindowFocused(true);
    expect(scheduledDelays.at(-1)).toBe(foregroundDelayMs());
    tracker.dispose();
  });

  it("lengthens the interval by the background multiplier on blur", () => {
    const tracker = new UsageTracker(storageManager, configManager, () => 0);
    // Start the poll loop so a poll timeout is active and can be rescheduled.
    tracker.triggerRefreshSoon(0, "poller");
    scheduledDelays.length = 0;

    tracker.setWindowFocused(false);

    expect(tracker.isWindowFocused()).toBe(false);
    expect(scheduledDelays.at(-1)).toBe(backgroundDelayMs());
    tracker.dispose();
  });

  it("shortens back to the foreground cadence on focus", () => {
    const tracker = new UsageTracker(storageManager, configManager, () => 0);
    tracker.triggerRefreshSoon(0, "poller");
    tracker.setWindowFocused(false);
    scheduledDelays.length = 0;

    tracker.setWindowFocused(true);

    expect(tracker.isWindowFocused()).toBe(true);
    expect(scheduledDelays.at(-1)).toBe(foregroundDelayMs());
    tracker.dispose();
  });

  it("ignores redundant focus updates (no extra reschedule)", () => {
    const tracker = new UsageTracker(storageManager, configManager, () => 0);
    tracker.triggerRefreshSoon(0, "poller");
    scheduledDelays.length = 0;

    tracker.setWindowFocused(true); // already focused -> no-op

    expect(scheduledDelays.length).toBe(0);
    tracker.dispose();
  });

  it("does not resurrect timers when polling is stopped", () => {
    const tracker = new UsageTracker(storageManager, configManager, () => 0);
    tracker.triggerRefreshSoon(0, "poller");
    tracker.stopDataFetching(); // clears the active poll timeout
    scheduledDelays.length = 0;

    tracker.setWindowFocused(false);

    expect(scheduledDelays.length).toBe(0);
    tracker.dispose();
  });
});
