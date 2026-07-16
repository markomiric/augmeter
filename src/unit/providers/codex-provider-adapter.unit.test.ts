import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CodexProviderAdapter } from "../../providers/adapters/codex-provider-adapter";

function writeJsonl(filePath: string, entries: unknown[]): void {
  const lines = entries.map(entry => JSON.stringify(entry));
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

describe("CodexProviderAdapter", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("collects rolling 5h and weekly user_message counts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-codex-"));
    tempDirs.push(root);

    const nested = path.join(root, "2026", "02", "16");
    fs.mkdirSync(nested, { recursive: true });

    const now = new Date("2026-02-16T12:00:00.000Z");
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const weekly = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const stale = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();

    writeJsonl(path.join(nested, "session.jsonl"), [
      { type: "session_meta", payload: { source: "vscode" } },
      { type: "event_msg", timestamp: recent, payload: { type: "user_message" } },
      { type: "event_msg", timestamp: weekly, payload: { type: "user_message" } },
      { type: "event_msg", timestamp: stale, payload: { type: "user_message" } },
      { type: "event_msg", timestamp: recent, payload: { type: "agent_message" } },
      { type: "response_item", timestamp: recent, payload: { type: "user_message" } },
    ]);
    writeJsonl(path.join(nested, "subagent.jsonl"), [
      { type: "session_meta", payload: { source: { subagent: { thread_spawn: {} } } } },
      { type: "event_msg", timestamp: recent, payload: { type: "user_message" } },
    ]);

    const adapter = new CodexProviderAdapter(() => root);
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
    const adapter = new CodexProviderAdapter(() => "/does/not/matter");
    const result = await adapter.collectUsage({
      now: new Date(),
      workspaceTrusted: false,
      forceRefresh: true,
    });

    expect(result.snapshots).toHaveLength(0);
    expect(result.health.status).toBe("restricted");
  });

  it("returns degraded health when the directory has no JSONL files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-codex-empty-"));
    tempDirs.push(root);

    const adapter = new CodexProviderAdapter(() => root);
    const result = await adapter.collectUsage({
      now: new Date("2026-02-16T12:00:00.000Z"),
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(result.health.status).toBe("degraded");
    expect(result.snapshots).toHaveLength(0);
  });

  it("does not throw and does not count a partial trailing JSON fragment with no terminating newline", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-codex-trailing-"));
    tempDirs.push(root);

    const now = new Date("2026-02-16T12:00:00.000Z");
    const valid = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const filePath = path.join(root, "session.jsonl");

    // One complete event_msg line, then a partial JSON with the right type markers but no closing
    // brace and no newline. flushTrailingFragment receives it, JSON.parse fails, kept but not counted.
    fs.writeFileSync(
      filePath,
      `${JSON.stringify({ type: "event_msg", timestamp: valid, payload: { type: "user_message" } })}\n{"type":"event_msg","payload":{"type":"user_message"},"timestamp":`,
      "utf8"
    );

    const adapter = new CodexProviderAdapter(() => root);
    const result = await adapter.collectUsage({
      now,
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(result.health.status).toBe("connected");
    expect(result.snapshots.find(s => s.windowType === "weekly_7d")?.used).toBe(1);
  });

  it("handles malformed entries and incremental appends", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-codex-incremental-"));
    tempDirs.push(root);

    const nested = path.join(root, "sessions");
    fs.mkdirSync(nested, { recursive: true });
    const filePath = path.join(nested, "session.jsonl");

    const now = new Date("2026-02-16T12:00:00.000Z");
    const first = new Date(now.getTime() - 50 * 60 * 1000).toISOString();
    const second = new Date(now.getTime() - 20 * 60 * 1000).toISOString();

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({ type: "event_msg", timestamp: first, payload: { type: "user_message" } })}\n{bad\n`,
      "utf8"
    );

    const adapter = new CodexProviderAdapter(() => root);
    const initial = await adapter.collectUsage({
      now,
      workspaceTrusted: true,
      forceRefresh: true,
    });
    expect(initial.snapshots.find(snapshot => snapshot.windowType === "weekly_7d")?.used).toBe(1);

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({ type: "event_msg", timestamp: second, payload: { type: "user_message" } })}\n`,
      "utf8"
    );

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
