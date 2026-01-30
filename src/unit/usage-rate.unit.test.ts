import { describe, it, expect } from "vitest";
import { UsageTracker } from "../features/usage/usage-tracker";
import type { UsageSnapshot } from "../core/storage/storage-manager";
import { formatRateLine, formatProjectionLine, buildMarkdownTooltip } from "../ui/status-bar-logic";

function makeSnapshot(hoursAgo: number, consumed: number): UsageSnapshot {
  const ts = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  return { timestamp: ts, consumed };
}

describe("Usage Rate Computation", () => {
  describe("UsageTracker.computeUsageRate", () => {
    it("returns null with no snapshots", () => {
      expect(UsageTracker.computeUsageRate([], 24)).toBe(null);
    });

    it("returns null with a single snapshot", () => {
      expect(UsageTracker.computeUsageRate([makeSnapshot(1, 100)], 24)).toBe(null);
    });

    it("computes rate from two snapshots", () => {
      const snapshots = [makeSnapshot(2, 100), makeSnapshot(0, 200)];
      const rate = UsageTracker.computeUsageRate(snapshots, 24);
      expect(rate).toBeCloseTo(50, 0); // 100 credits over 2 hours = 50/hr
    });

    it("computes rate from multiple snapshots using first and last", () => {
      const snapshots = [makeSnapshot(4, 100), makeSnapshot(2, 200), makeSnapshot(0, 400)];
      const rate = UsageTracker.computeUsageRate(snapshots, 24);
      expect(rate).toBeCloseTo(75, 0); // 300 credits over 4 hours = 75/hr
    });

    it("returns null when delta is negative (billing cycle reset)", () => {
      const snapshots = [makeSnapshot(2, 500), makeSnapshot(0, 50)];
      expect(UsageTracker.computeUsageRate(snapshots, 24)).toBe(null);
    });

    it("returns 0 when no credits consumed", () => {
      const snapshots = [makeSnapshot(3, 200), makeSnapshot(0, 200)];
      const rate = UsageTracker.computeUsageRate(snapshots, 24);
      expect(rate).toBeCloseTo(0, 0);
    });

    it("filters snapshots outside the window", () => {
      const snapshots = [
        makeSnapshot(48, 50), // outside 24h window
        makeSnapshot(2, 100),
        makeSnapshot(0, 200),
      ];
      const rate = UsageTracker.computeUsageRate(snapshots, 24);
      expect(rate).toBeCloseTo(50, 0); // only uses 2h window data
    });

    it("returns null when time span is under 1 minute", () => {
      const now = Date.now();
      const snapshots: UsageSnapshot[] = [
        { timestamp: new Date(now - 30_000).toISOString(), consumed: 100 }, // 30s ago
        { timestamp: new Date(now).toISOString(), consumed: 200 },
      ];
      expect(UsageTracker.computeUsageRate(snapshots, 24)).toBe(null);
    });
  });

  describe("UsageTracker.computeProjectedDays", () => {
    it("returns null when rate is null", () => {
      expect(UsageTracker.computeProjectedDays(1000, null)).toBe(null);
    });

    it("returns null when rate is zero", () => {
      expect(UsageTracker.computeProjectedDays(1000, 0)).toBe(null);
    });

    it("returns null when rate is negative", () => {
      expect(UsageTracker.computeProjectedDays(1000, -5)).toBe(null);
    });

    it("computes projection correctly", () => {
      // 2400 remaining, 100/hr => 24 hours => 1 day
      expect(UsageTracker.computeProjectedDays(2400, 100)).toBeCloseTo(1, 1);
    });

    it("computes multi-day projection", () => {
      // 48000 remaining, 100/hr => 480 hours => 20 days
      expect(UsageTracker.computeProjectedDays(48000, 100)).toBeCloseTo(20, 1);
    });

    it("returns 0 when remaining is 0", () => {
      // Edge case: 0 remaining but positive rate
      const result = UsageTracker.computeProjectedDays(0, 100);
      expect(result).toBe(0);
    });
  });
});

describe("Tooltip Rate/Projection Formatting", () => {
  describe("formatRateLine", () => {
    it("returns null for null input", () => {
      expect(formatRateLine(null)).toBe(null);
    });

    it("returns null for undefined input", () => {
      expect(formatRateLine(undefined)).toBe(null);
    });

    it("returns no activity for zero rate", () => {
      expect(formatRateLine(0)).toBe("**Rate:** No recent activity");
    });

    it("formats rate with rounding", () => {
      expect(formatRateLine(520.7)).toBe("**Rate:** ~521/hr");
    });

    it("formats large rate", () => {
      const line = formatRateLine(1500);
      expect(line).toContain("~");
      expect(line).toContain("/hr");
    });
  });

  describe("formatProjectionLine", () => {
    it("returns null for null input", () => {
      expect(formatProjectionLine(null)).toBe(null);
    });

    it("returns null for undefined input", () => {
      expect(formatProjectionLine(undefined)).toBe(null);
    });

    it("returns exhausted for zero days", () => {
      expect(formatProjectionLine(0)).toBe("**Projected:** Credits exhausted");
    });

    it("shows hours when less than 1 day", () => {
      const line = formatProjectionLine(0.5);
      expect(line).toContain("h remaining");
    });

    it("shows days for multi-day projection", () => {
      expect(formatProjectionLine(22.3)).toBe("**Projected:** ~22 days remaining");
    });

    it("rounds hours to at least 1", () => {
      const line = formatProjectionLine(0.01);
      expect(line).toBe("**Projected:** ~1h remaining");
    });
  });

  describe("buildMarkdownTooltip with rate/projection/session data", () => {
    const baseParams = {
      used: 183867,
      limit: 460517,
      remaining: 276650,
      percentage: 40,
      hasRealData: true,
      clickAction: "refresh" as const,
      subscriptionType: "Pro",
    };

    it("includes rate and projection lines when provided", () => {
      const tooltip = buildMarkdownTooltip({
        ...baseParams,
        usageRatePerHour: 520,
        projectedDaysRemaining: 22,
      });
      expect(tooltip).toContain("**Rate:** ~520/hr");
      expect(tooltip).toContain("**Projected:** ~22 days remaining");
    });

    it("omits rate/projection when null", () => {
      const tooltip = buildMarkdownTooltip({
        ...baseParams,
        usageRatePerHour: null,
        projectedDaysRemaining: null,
      });
      expect(tooltip).not.toContain("Rate:");
      expect(tooltip).not.toContain("Projected:");
    });

    it("omits rate/projection when not provided", () => {
      const tooltip = buildMarkdownTooltip(baseParams);
      expect(tooltip).not.toContain("Rate:");
      expect(tooltip).not.toContain("Projected:");
    });

    it("shows hours for less than 1 day remaining", () => {
      const tooltip = buildMarkdownTooltip({
        ...baseParams,
        usageRatePerHour: 5000,
        projectedDaysRemaining: 0.5,
      });
      expect(tooltip).toContain("h remaining");
    });

    it("includes session activity when provided", () => {
      const tooltip = buildMarkdownTooltip({
        ...baseParams,
        sessionActivity: { promptCount: 15, sessionCount: 4 },
      });
      expect(tooltip).toContain("**Today:** 15 prompts across 4 sessions");
    });

    it("uses singular for 1 prompt 1 session", () => {
      const tooltip = buildMarkdownTooltip({
        ...baseParams,
        sessionActivity: { promptCount: 1, sessionCount: 1 },
      });
      expect(tooltip).toContain("1 prompt across 1 session");
      expect(tooltip).not.toContain("prompts");
      expect(tooltip).not.toContain("sessions");
    });

    it("omits session activity when zero prompts", () => {
      const tooltip = buildMarkdownTooltip({
        ...baseParams,
        sessionActivity: { promptCount: 0, sessionCount: 0 },
      });
      expect(tooltip).not.toContain("Today:");
    });

    it("omits session activity when null", () => {
      const tooltip = buildMarkdownTooltip({
        ...baseParams,
        sessionActivity: null,
      });
      expect(tooltip).not.toContain("Today:");
    });

    it("does not show rate/projection/session when not signed in", () => {
      const tooltip = buildMarkdownTooltip({
        ...baseParams,
        hasRealData: false,
        usageRatePerHour: 520,
        projectedDaysRemaining: 22,
        sessionActivity: { promptCount: 10, sessionCount: 2 },
      });
      expect(tooltip).not.toContain("Rate:");
      expect(tooltip).not.toContain("Projected:");
      expect(tooltip).not.toContain("Today:");
    });
  });
});
