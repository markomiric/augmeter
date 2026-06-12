import { SessionReader, type SessionActivity } from "../../services/session-reader";

export interface UsageThresholdConfig {
  warning: number;
  high: number;
  critical: number;
}

export function calculateProjectedDays(
  remaining: number,
  ratePerHour: number | null
): number | null {
  if (remaining <= 0) return 0;
  if (ratePerHour === null || ratePerHour <= 0) return null;
  return remaining / (ratePerHour * 24);
}

export function buildAlertCycleId(
  renewalDate?: string | undefined,
  now: Date = new Date()
): string {
  if (renewalDate) {
    const date = new Date(renewalDate);
    if (!Number.isNaN(date.getTime())) {
      return `renewal-${date.toISOString().split("T")[0]}`;
    }
  }

  return `month-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function selectTriggeredThreshold(
  percentage: number,
  thresholds: UsageThresholdConfig,
  lastNotified: number
): number | null {
  const orderedThresholds = [thresholds.critical, thresholds.high, thresholds.warning].sort(
    (a, b) => b - a
  );

  return (
    orderedThresholds.find(threshold => percentage >= threshold && lastNotified < threshold) ?? null
  );
}

export function shouldNotifyProjectedRunOut(
  projectedDays: number | null,
  runOutDays: number,
  alreadyAlerted: boolean
): boolean {
  return (
    runOutDays > 0 &&
    projectedDays !== null &&
    projectedDays > 0 &&
    projectedDays <= runOutDays &&
    !alreadyAlerted
  );
}

export function readTrackedSessionActivity(
  sessionTrackingEnabled: boolean,
  sessionTrackingPath?: string
): SessionActivity | null {
  if (!sessionTrackingEnabled) {
    return null;
  }

  try {
    return new SessionReader(sessionTrackingPath || undefined).getTodayActivity();
  } catch {
    return null;
  }
}
