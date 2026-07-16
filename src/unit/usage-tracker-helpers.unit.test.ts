import { describe, expect, it } from "vitest";
import {
  buildAlertCycleId,
  calculateProjectedDays,
  selectTriggeredThreshold,
  shouldNotifyProjectedRunOut,
} from "../features/usage/usage-tracker-helpers";

describe("usage-tracker-helpers", () => {
  describe("calculateProjectedDays", () => {
    it("returns null when rate is unavailable", () => {
      expect(calculateProjectedDays(1200, null)).toBe(null);
    });

    it("returns zero when there is no remaining usage", () => {
      expect(calculateProjectedDays(0, 100)).toBe(0);
    });

    it("computes days from remaining usage and hourly rate", () => {
      expect(calculateProjectedDays(2400, 100)).toBeCloseTo(1, 1);
    });
  });

  describe("buildAlertCycleId", () => {
    it("uses renewal date when it is valid", () => {
      expect(buildAlertCycleId("2026-06-15T00:00:00.000Z")).toBe("renewal-2026-06-15");
    });

    it("falls back to the current UTC month when renewal date is invalid", () => {
      expect(buildAlertCycleId("not-a-date", new Date("2026-03-23T10:00:00.000Z"))).toBe(
        "month-2026-03"
      );
    });
  });

  describe("selectTriggeredThreshold", () => {
    const thresholds = { warning: 75, high: 90, critical: 95 };

    it("selects the highest newly crossed threshold", () => {
      expect(selectTriggeredThreshold(96, thresholds, 0)).toBe(95);
    });

    it("returns null when no new threshold was crossed", () => {
      expect(selectTriggeredThreshold(92, thresholds, 90)).toBe(null);
    });
  });

  describe("shouldNotifyProjectedRunOut", () => {
    it("returns true when projection is within the configured window", () => {
      expect(shouldNotifyProjectedRunOut(2.4, 3, false)).toBe(true);
    });

    it("returns false when the alert was already shown", () => {
      expect(shouldNotifyProjectedRunOut(2.4, 3, true)).toBe(false);
    });
  });
});
