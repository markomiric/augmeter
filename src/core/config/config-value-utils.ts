/**
 * ABOUTME: Shared numeric coercion for config sections.
 */

/**
 * Round a config value to an integer, falling back when it is not a finite number.
 */
export function toRoundedNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  return fallback;
}
