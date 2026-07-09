import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeProviderAdapter } from "../../providers/adapters/claude-provider-adapter";

function writeJsonl(filePath: string, entries: unknown[]): void {
  const lines = entries.map(entry => JSON.stringify(entry));
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

describe("ClaudeProviderAdapter", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("collects rolling 5h and weekly message counts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-claude-"));
    tempDirs.push(root);

    const now = new Date("2026-02-16T12:00:00.000Z");
    const recent = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const weekly = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const stale = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();

    writeJsonl(path.join(root, "session.jsonl"), [
      { type: "user", timestamp: recent },
      { type: "user", timestamp: weekly },
      { type: "user", timestamp: stale },
      { type: "assistant", timestamp: recent },
    ]);

    const adapter = new ClaudeProviderAdapter(() => root);
    const result = await adapter.collectUsage({
      now,
      workspaceTrusted: true,
      forceRefresh: true,
    });

    const fiveHour = result.snapshots.find(snapshot => snapshot.windowType === "rolling_5h");
    const sevenDay = result.snapshots.find(snapshot => snapshot.windowType === "weekly_7d");

    expect(result.health.status).toBe("connected");
    expect(fiveHour?.used).toBe(1);
    expect(sevenDay?.used).toBe(2);
  });

  it("returns restricted health in untrusted workspaces", async () => {
    const adapter = new ClaudeProviderAdapter(() => "/does/not/matter");
    const result = await adapter.collectUsage({
      now: new Date(),
      workspaceTrusted: false,
      forceRefresh: true,
    });

    expect(result.snapshots).toHaveLength(0);
    expect(result.health.status).toBe("restricted");
  });

  it("returns degraded health when the directory has no JSONL files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-claude-empty-"));
    tempDirs.push(root);

    const adapter = new ClaudeProviderAdapter(() => root);
    const result = await adapter.collectUsage({
      now: new Date("2026-02-16T12:00:00.000Z"),
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(result.health.status).toBe("degraded");
    expect(result.snapshots).toHaveLength(0);
  });

  it("does not throw and does not count a partial trailing JSON fragment with no terminating newline", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-claude-trailing-"));
    tempDirs.push(root);

    const now = new Date("2026-02-16T12:00:00.000Z");
    const valid = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const filePath = path.join(root, "session.jsonl");

    // One complete user line, then a partial JSON object with no closing brace and no newline.
    // flushTrailingFragment receives the fragment, JSON.parse fails, it is kept but not counted.
    fs.writeFileSync(
      filePath,
      `${JSON.stringify({ type: "user", timestamp: valid })}\n{"type":"user","timestamp":`,
      "utf8"
    );

    const adapter = new ClaudeProviderAdapter(() => root);
    const result = await adapter.collectUsage({
      now,
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(result.health.status).toBe("connected");
    expect(result.snapshots.find(s => s.windowType === "weekly_7d")?.used).toBe(1);
  });

  it("ignores malformed lines and supports incremental append scans", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-claude-incremental-"));
    tempDirs.push(root);

    const filePath = path.join(root, "session.jsonl");
    const now = new Date("2026-02-16T12:00:00.000Z");
    const first = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const second = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({ type: "user", timestamp: first })}\nnot-json-line\n`,
      "utf8"
    );

    const adapter = new ClaudeProviderAdapter(() => root);

    const initial = await adapter.collectUsage({
      now,
      workspaceTrusted: true,
      forceRefresh: true,
    });
    expect(initial.snapshots.find(snapshot => snapshot.windowType === "weekly_7d")?.used).toBe(1);

    fs.appendFileSync(filePath, `${JSON.stringify({ type: "user", timestamp: second })}\n`, "utf8");

    const followUp = await adapter.collectUsage({
      now: new Date("2026-02-16T12:05:00.000Z"),
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(followUp.health.status).toBe("connected");
    expect(followUp.snapshots.find(snapshot => snapshot.windowType === "weekly_7d")?.used).toBe(2);
    expect(followUp.snapshots.find(snapshot => snapshot.windowType === "rolling_5h")?.used).toBe(2);
  });
});
