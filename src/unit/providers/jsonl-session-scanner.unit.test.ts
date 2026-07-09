import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ExtractTimestamp,
  JsonlSessionScanner,
  asRecord,
  toTimestamp,
} from "../../providers/adapters/jsonl-session-scanner";

// Minimal extractor: recognises lines of the form {"ts":"<ISO>"}.
const extract: ExtractTimestamp = (line: string): number | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const obj = asRecord(parsed);
  return obj ? toTimestamp(obj["ts"]) : null;
};

// Serialise a single timestamp into the {"ts":"<ISO>"} line format.
function tsLine(isoDate: string): string {
  return JSON.stringify({ ts: isoDate });
}

describe("JsonlSessionScanner", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  const nowMs = new Date("2026-02-16T12:00:00.000Z").getTime();
  const cutoffFiveHour = nowMs - 5 * 60 * 60 * 1000;
  const cutoffWeekly = nowMs - 7 * 24 * 60 * 60 * 1000;

  it("counts only newly appended timestamps on the second scan (incremental read)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aug-scanner-incr-"));
    tempDirs.push(root);
    const filePath = path.join(root, "session.jsonl");

    const ts1 = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const ts2 = new Date(nowMs - 30 * 60 * 1000).toISOString();

    fs.writeFileSync(filePath, tsLine(ts1) + "\n", "utf8");

    const scanner = new JsonlSessionScanner(extract);
    const first = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
    expect(first.weeklyMessages).toBe(1);

    fs.appendFileSync(filePath, tsLine(ts2) + "\n", "utf8");

    const second = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
    expect(second.weeklyMessages).toBe(2);
    expect(second.rollingFiveHourMessages).toBe(2);
  });

  it("excludes timestamps outside the weekly cutoff and buckets 5h vs weekly correctly", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aug-scanner-retention-"));
    tempDirs.push(root);
    const filePath = path.join(root, "session.jsonl");

    const within5h = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
    const withinWeekly = new Date(nowMs - 3 * 24 * 60 * 60 * 1000).toISOString();
    const stale = new Date(nowMs - 9 * 24 * 60 * 60 * 1000).toISOString();

    fs.writeFileSync(
      filePath,
      [tsLine(within5h), tsLine(withinWeekly), tsLine(stale)].join("\n") + "\n",
      "utf8"
    );

    const scanner = new JsonlSessionScanner(extract);
    const result = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
    expect(result.rollingFiveHourMessages).toBe(1);
    expect(result.weeklyMessages).toBe(2);
    expect(result.filesScanned).toBe(1);
  });

  it("skips malformed (non-JSON) lines without throwing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aug-scanner-malformed-"));
    tempDirs.push(root);
    const filePath = path.join(root, "session.jsonl");

    const ts1 = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const ts2 = new Date(nowMs - 30 * 60 * 1000).toISOString();

    fs.writeFileSync(
      filePath,
      [tsLine(ts1), "not-json", "{broken:", tsLine(ts2)].join("\n") + "\n",
      "utf8"
    );

    const scanner = new JsonlSessionScanner(extract);
    const result = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
    expect(result.weeklyMessages).toBe(2);
  });

  it("preserves a partial trailing fragment and counts the line exactly once after it is completed (cross-chunk carry-forward)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aug-scanner-fragment-"));
    tempDirs.push(root);
    const filePath = path.join(root, "session.jsonl");

    const ts1 = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const ts2 = new Date(nowMs - 30 * 60 * 1000).toISOString();

    // Complete line then the opening of a second line — no closing brace, no newline.
    const openingFragment = `{"ts":"${ts2}"`;
    fs.writeFileSync(filePath, tsLine(ts1) + "\n" + openingFragment, "utf8");

    const scanner = new JsonlSessionScanner(extract);
    const first = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);

    // The fragment must NOT be counted yet.
    expect(first.weeklyMessages).toBe(1);

    // Append the closing brace and newline to complete the second line.
    fs.appendFileSync(filePath, "}\n", "utf8");

    const second = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);

    // The completed line is counted EXACTLY once: not zero, not twice.
    expect(second.weeklyMessages).toBe(2);
    expect(second.rollingFiveHourMessages).toBe(2);
  });
});
