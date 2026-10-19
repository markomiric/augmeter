import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ExtractPrimaryTimestamp,
  type ExtractTimestamp,
  JsonlSessionScanner,
  PRIMARY_RECORD_SEEN,
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

  it("keeps a file's last counts, or skips it, when it can't be read after stat", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aug-scanner-unreadable-"));
    tempDirs.push(root);
    const known = path.join(root, "known.jsonl");
    const fresh = path.join(root, "fresh.jsonl");
    const recent = new Date(nowMs - 30 * 60 * 1000).toISOString();
    fs.writeFileSync(known, tsLine(recent) + "\n", "utf8");

    const scanner = new JsonlSessionScanner(extract);
    const first = await scanner.countMessages([known], cutoffFiveHour, cutoffWeekly);
    expect(first.weeklyMessages).toBe(1);

    fs.appendFileSync(known, tsLine(recent) + "\n", "utf8");
    fs.writeFileSync(fresh, tsLine(recent) + "\n", "utf8");
    const read = vi
      .spyOn(
        scanner as unknown as { readTimestampsIncremental: () => Promise<unknown> },
        "readTimestampsIncremental"
      )
      .mockRejectedValue(Object.assign(new Error("locked"), { code: "EBUSY" }));

    const result = await scanner.countMessages([known, fresh], cutoffFiveHour, cutoffWeekly);

    expect(read).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ rollingFiveHourMessages: 1, weeklyMessages: 1, filesScanned: 1 });
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

  it("counts bytes appended during a read once, on the next scan (read bounded to the stat size)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aug-scanner-append-race-"));
    tempDirs.push(root);
    const filePath = path.join(root, "session.jsonl");

    const ts1 = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const ts2 = new Date(nowMs - 30 * 60 * 1000).toISOString();
    fs.writeFileSync(filePath, tsLine(ts1) + "\n", "utf8");

    // Append a line right after the scanner captured the file size, before it reads.
    const realStat = fs.promises.stat.bind(fs.promises);
    const statSpy = vi.spyOn(fs.promises, "stat").mockImplementationOnce((async (
      target: fs.PathLike
    ) => {
      const stats = await realStat(target);
      fs.appendFileSync(filePath, tsLine(ts2) + "\n", "utf8");
      return stats;
    }) as typeof fs.promises.stat);

    try {
      const scanner = new JsonlSessionScanner(extract);
      const first = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
      expect(first.weeklyMessages).toBe(1);

      const second = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
      expect(second.weeklyMessages).toBe(2);
    } finally {
      statSpy.mockRestore();
    }
  });

  it("drops an unfinished fragment larger than 1 MiB instead of keeping its tail", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aug-scanner-huge-fragment-"));
    tempDirs.push(root);
    const filePath = path.join(root, "session.jsonl");
    const ts1 = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const ts2 = new Date(nowMs - 30 * 60 * 1000).toISOString();

    // An unfinished line whose last 4 KiB would look like a complete record on its own.
    const hugePrefix = `{"pad":"${"y".repeat(1024 * 1024 + 10)}",`;
    fs.writeFileSync(filePath, `${tsLine(ts1)}\n${hugePrefix}${tsLine(ts2)}`, "utf8");

    const scanner = new JsonlSessionScanner(extract);
    const first = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
    expect(first.weeklyMessages).toBe(1);

    fs.appendFileSync(filePath, "}\n", "utf8");
    const second = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
    expect(second.weeklyMessages).toBe(1);
  });

  describe("primary and fallback extractors", () => {
    // Primary lines are {"p":"<ISO>"} or {"p":"seen"}; fallback lines are {"f":"<ISO>"}.
    const primary: ExtractPrimaryTimestamp = line => {
      const obj = asRecord(JSON.parse(line));
      if (!obj || !("p" in obj)) return null;
      return obj["p"] === PRIMARY_RECORD_SEEN ? PRIMARY_RECORD_SEEN : toTimestamp(obj["p"]);
    };
    const fallback: ExtractTimestamp = line => {
      const obj = asRecord(JSON.parse(line));
      return obj ? toTimestamp(obj["f"]) : null;
    };
    const p = (value: string) => JSON.stringify({ p: value });
    const f = (iso: string) => JSON.stringify({ f: iso });
    const recent = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const older = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString();

    function writeFile(name: string, lines: string[]): string {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "aug-scanner-fallback-"));
      tempDirs.push(root);
      const filePath = path.join(root, name);
      fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
      return filePath;
    }

    it("counts primary timestamps only in a file that has primary records", async () => {
      const filePath = writeFile("both.jsonl", [f(recent), p(recent), f(older), p(older)]);
      const scanner = new JsonlSessionScanner(primary, fallback);
      const result = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
      expect(result.weeklyMessages).toBe(2);
      expect(result.rollingFiveHourMessages).toBe(1);
    });

    it("counts fallback timestamps in a file without primary records", async () => {
      const legacy = writeFile("legacy.jsonl", [f(recent), f(older)]);
      const current = writeFile("current.jsonl", [p(recent)]);
      const scanner = new JsonlSessionScanner(primary, fallback);
      const result = await scanner.countMessages([legacy, current], cutoffFiveHour, cutoffWeekly);
      expect(result.weeklyMessages).toBe(3);
    });

    it("suppresses the fallback when the only primary record is not countable", async () => {
      const filePath = writeFile("seen.jsonl", [p(PRIMARY_RECORD_SEEN), f(recent)]);
      const scanner = new JsonlSessionScanner(primary, fallback);
      const result = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
      expect(result.weeklyMessages).toBe(0);
    });

    it("suppresses the fallback when the primary record is outside the weekly window", async () => {
      const stale = new Date(nowMs - 9 * 24 * 60 * 60 * 1000).toISOString();
      const filePath = writeFile("stale-primary.jsonl", [p(stale), f(recent)]);
      const scanner = new JsonlSessionScanner(primary, fallback);
      const result = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
      expect(result.weeklyMessages).toBe(0);
    });

    it("keeps the per-file preference across incremental appends", async () => {
      const filePath = writeFile("append.jsonl", [f(older), p(older)]);
      const scanner = new JsonlSessionScanner(primary, fallback);
      const first = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
      expect(first.weeklyMessages).toBe(1);

      // The appended chunk has only a fallback line; the file still prefers primary records.
      fs.appendFileSync(filePath, f(recent) + "\n" + p(recent) + "\n" + f(recent) + "\n", "utf8");
      const second = await scanner.countMessages([filePath], cutoffFiveHour, cutoffWeekly);
      expect(second.weeklyMessages).toBe(2);
      expect(second.rollingFiveHourMessages).toBe(1);
    });
  });
});
