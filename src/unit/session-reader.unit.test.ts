import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionReader } from "../services/session-reader";

describe("SessionReader", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-session-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSession(filename: string, data: any) {
    fs.writeFileSync(path.join(tmpDir, filename), JSON.stringify(data), "utf-8");
  }

  const today = new Date().toISOString().split("T")[0]!;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;

  it("returns zeros for non-existent directory", () => {
    const result = SessionReader.computeActivity("/nonexistent/dir");
    expect(result).toEqual({ promptCount: 0, sessionCount: 0 });
  });

  it("returns zeros for empty directory", () => {
    const result = SessionReader.computeActivity(tmpDir);
    expect(result).toEqual({ promptCount: 0, sessionCount: 0 });
  });

  it("counts prompts from array-format session file", () => {
    writeSession("session1.json", [
      { finishedAt: `${today}T10:00:00.000Z`, request_message: "hello" },
      { finishedAt: `${today}T11:00:00.000Z`, request_message: "world" },
    ]);

    const result = SessionReader.computeActivity(tmpDir);
    expect(result.promptCount).toBe(2);
    expect(result.sessionCount).toBe(1);
  });

  it("counts prompts from object-with-exchanges format", () => {
    writeSession("session2.json", {
      id: "sess-123",
      exchanges: [
        { finishedAt: `${today}T09:00:00.000Z`, response_text: "hi" },
        { finishedAt: `${today}T09:30:00.000Z`, response_text: "ok" },
        { finishedAt: `${today}T10:00:00.000Z`, response_text: "done" },
      ],
    });

    const result = SessionReader.computeActivity(tmpDir);
    expect(result.promptCount).toBe(3);
    expect(result.sessionCount).toBe(1);
  });

  it("filters by date — only counts today's exchanges", () => {
    writeSession("session3.json", [
      { finishedAt: `${yesterday}T23:00:00.000Z`, request_message: "old" },
      { finishedAt: `${today}T01:00:00.000Z`, request_message: "new" },
    ]);

    const result = SessionReader.computeActivity(tmpDir);
    expect(result.promptCount).toBe(1);
    expect(result.sessionCount).toBe(1);
  });

  it("counts across multiple session files", () => {
    writeSession("a.json", [
      { finishedAt: `${today}T08:00:00.000Z` },
      { finishedAt: `${today}T08:30:00.000Z` },
    ]);
    writeSession("b.json", [{ finishedAt: `${today}T09:00:00.000Z` }]);
    writeSession("c.json", [
      { finishedAt: `${yesterday}T23:00:00.000Z` }, // no today activity
    ]);

    const result = SessionReader.computeActivity(tmpDir);
    expect(result.promptCount).toBe(3);
    expect(result.sessionCount).toBe(2); // only a.json and b.json had today activity
  });

  it("skips malformed JSON files gracefully", () => {
    fs.writeFileSync(path.join(tmpDir, "bad.json"), "not valid json", "utf-8");
    writeSession("good.json", [{ finishedAt: `${today}T12:00:00.000Z` }]);

    const result = SessionReader.computeActivity(tmpDir);
    expect(result.promptCount).toBe(1);
    expect(result.sessionCount).toBe(1);
  });

  it("skips non-json files", () => {
    fs.writeFileSync(path.join(tmpDir, "readme.txt"), "not a session", "utf-8");
    writeSession("real.json", [{ finishedAt: `${today}T14:00:00.000Z` }]);

    const result = SessionReader.computeActivity(tmpDir);
    expect(result.promptCount).toBe(1);
    expect(result.sessionCount).toBe(1);
  });

  it("handles exchanges with missing finishedAt", () => {
    writeSession("partial.json", [
      { finishedAt: `${today}T10:00:00.000Z` },
      { request_message: "no timestamp" }, // no finishedAt
      { finishedAt: null },
      { finishedAt: 12345 }, // wrong type
    ]);

    const result = SessionReader.computeActivity(tmpDir);
    expect(result.promptCount).toBe(1);
    expect(result.sessionCount).toBe(1);
  });

  it("handles empty session arrays", () => {
    writeSession("empty.json", []);
    const result = SessionReader.computeActivity(tmpDir);
    expect(result).toEqual({ promptCount: 0, sessionCount: 0 });
  });

  it("respects custom reference date", () => {
    writeSession("session.json", [
      { finishedAt: `${yesterday}T10:00:00.000Z` },
      { finishedAt: `${today}T10:00:00.000Z` },
    ]);

    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = SessionReader.computeActivity(tmpDir, yesterdayDate);
    expect(result.promptCount).toBe(1);
    expect(result.sessionCount).toBe(1);
  });

  it("SessionReader constructor uses custom path", () => {
    writeSession("test.json", [{ finishedAt: `${today}T15:00:00.000Z` }]);
    const reader = new SessionReader(tmpDir);
    const result = reader.getTodayActivity();
    expect(result.promptCount).toBe(1);
  });
});
