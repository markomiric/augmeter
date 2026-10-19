import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("collects rolling 5h and weekly legacy user_message counts when a file has no task_started", async () => {
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

  describe("task_started turns", () => {
    const now = new Date("2026-02-16T12:00:00.000Z");
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const weekly = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const stale = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();

    const sessionMeta = (source: unknown = "cli") => ({
      type: "session_meta",
      payload: { source },
    });
    const taskStarted = (timestamp: string, attribution?: Record<string, unknown> | null) => ({
      timestamp,
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-1",
        ...(attribution === undefined ? {} : { turn_attribution: attribution }),
      },
    });
    const rootTurn = (turnTrigger: string | null) => ({
      turn_id: "turn-1",
      turn_trigger: turnTrigger,
      parent_turn_id: null,
    });
    const userMessage = (timestamp: string) => ({
      timestamp,
      type: "event_msg",
      payload: { type: "user_message", message: "synthetic" },
    });

    function makeRoot(): string {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-codex-turns-"));
      tempDirs.push(root);
      return root;
    }

    async function collect(adapter: CodexProviderAdapter, at: Date = now) {
      const result = await adapter.collectUsage({
        now: at,
        workspaceTrusted: true,
        forceRefresh: true,
      });
      return {
        result,
        fiveHour: result.snapshots.find(snapshot => snapshot.windowType === "rolling_5h")?.used,
        weekly: result.snapshots.find(snapshot => snapshot.windowType === "weekly_7d")?.used,
      };
    }

    it("counts root task_started turns in a paginated rollout", async () => {
      const root = makeRoot();
      writeJsonl(path.join(root, "rollout.jsonl"), [
        sessionMeta(),
        taskStarted(recent, rootTurn("composer")),
        taskStarted(recent, rootTurn("exec")),
        taskStarted(weekly, rootTurn("remote_android")),
        taskStarted(stale, rootTurn("composer")),
        { timestamp: recent, type: "event_msg", payload: { type: "agent_message" } },
      ]);

      const {
        result,
        fiveHour,
        weekly: weeklyCount,
      } = await collect(new CodexProviderAdapter(() => root));
      expect(result.health.status).toBe("connected");
      expect(fiveHour).toBe(2);
      expect(weeklyCount).toBe(3);
    });

    it.each([
      "automation_heartbeat_scheduled",
      "capacity_retry_automatic",
      "guardian_review",
      "resume_interrupted_task",
      "retry",
      "goal",
    ])("does not count a task_started turn with the automated trigger %s", async trigger => {
      const root = makeRoot();
      writeJsonl(path.join(root, "rollout.jsonl"), [
        sessionMeta(),
        taskStarted(recent, rootTurn(trigger)),
      ]);
      expect((await collect(new CodexProviderAdapter(() => root))).weekly).toBe(0);
    });

    it("does not count a child task_started turn (parent_turn_id set)", async () => {
      const root = makeRoot();
      writeJsonl(path.join(root, "rollout.jsonl"), [
        sessionMeta(),
        taskStarted(recent, {
          turn_id: "turn-2",
          turn_trigger: "composer",
          parent_turn_id: "turn-1",
        }),
      ]);
      expect((await collect(new CodexProviderAdapter(() => root))).weekly).toBe(0);
    });

    it("counts unknown and null triggers and task_started without turn_attribution", async () => {
      const root = makeRoot();
      writeJsonl(path.join(root, "rollout.jsonl"), [
        sessionMeta(),
        taskStarted(recent, rootTurn("a_future_entry_point")),
        taskStarted(recent, rootTurn(null)),
        taskStarted(recent, { turn_id: "turn-3" }),
        taskStarted(recent),
      ]);
      expect((await collect(new CodexProviderAdapter(() => root))).weekly).toBe(4);
    });

    it("counts a legacy rollout with both user_message and task_started once per turn", async () => {
      const root = makeRoot();
      writeJsonl(path.join(root, "legacy.jsonl"), [
        sessionMeta(),
        userMessage(recent),
        taskStarted(recent),
        userMessage(weekly),
        taskStarted(weekly),
      ]);
      const { fiveHour, weekly: weeklyCount } = await collect(new CodexProviderAdapter(() => root));
      expect(fiveHour).toBe(1);
      expect(weeklyCount).toBe(2);
    });

    it("counts user_message through the fallback only in files without task_started", async () => {
      const root = makeRoot();
      writeJsonl(path.join(root, "old-codex.jsonl"), [
        sessionMeta(),
        userMessage(recent),
        userMessage(weekly),
      ]);
      writeJsonl(path.join(root, "new-codex.jsonl"), [
        sessionMeta(),
        taskStarted(recent, rootTurn("composer")),
        userMessage(recent),
      ]);
      expect((await collect(new CodexProviderAdapter(() => root))).weekly).toBe(3);
    });

    it("suppresses the fallback when the file's only task_started is outside the window", async () => {
      const root = makeRoot();
      writeJsonl(path.join(root, "rollout.jsonl"), [
        sessionMeta(),
        taskStarted(stale, rootTurn("composer")),
        userMessage(recent),
      ]);
      expect((await collect(new CodexProviderAdapter(() => root))).weekly).toBe(0);
    });

    it("keeps the per-file preference across incremental appends", async () => {
      const root = makeRoot();
      const legacyPath = path.join(root, "legacy.jsonl");
      const fallbackPath = path.join(root, "fallback.jsonl");
      fs.writeFileSync(
        legacyPath,
        [sessionMeta(), userMessage(weekly), taskStarted(weekly)]
          .map(e => JSON.stringify(e))
          .join("\n") + "\n",
        "utf8"
      );
      fs.writeFileSync(
        fallbackPath,
        [sessionMeta(), userMessage(weekly)].map(e => JSON.stringify(e)).join("\n") + "\n",
        "utf8"
      );

      const adapter = new CodexProviderAdapter(() => root);
      expect((await collect(adapter)).weekly).toBe(2);

      fs.appendFileSync(
        legacyPath,
        `${JSON.stringify(userMessage(recent))}\n${JSON.stringify(taskStarted(recent))}\n`,
        "utf8"
      );
      fs.appendFileSync(fallbackPath, `${JSON.stringify(userMessage(recent))}\n`, "utf8");

      const followUp = await collect(adapter, new Date(now.getTime() + 60 * 1000));
      expect(followUp.weekly).toBe(4);
      expect(followUp.fiveHour).toBe(2);
    });

    describe("file selection", () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      function openedPaths(spy: { mock: { calls: unknown[][] } }): string[] {
        return spy.mock.calls.map(call => String(call[0]));
      }

      it("reads each session head at most once across forced refreshes and re-checks unconfirmed heads", async () => {
        const root = makeRoot();
        const userPath = path.join(root, "user.jsonl");
        const subagentPath = path.join(root, "subagent.jsonl");
        const headlessPath = path.join(root, "headless.jsonl");
        writeJsonl(userPath, [sessionMeta(), taskStarted(recent, rootTurn("composer"))]);
        writeJsonl(subagentPath, [
          sessionMeta({ subagent: { thread_spawn: {} } }),
          taskStarted(recent, rootTurn("composer")),
        ]);
        writeJsonl(headlessPath, [taskStarted(recent, rootTurn("composer"))]);

        const openSpy = vi.spyOn(fs.promises, "open");
        const adapter = new CodexProviderAdapter(() => root);
        expect((await collect(adapter)).weekly).toBe(2);
        expect((await collect(adapter)).weekly).toBe(2);

        const opened = openedPaths(openSpy);
        expect(opened.filter(p => p === userPath)).toHaveLength(1);
        expect(opened.filter(p => p === subagentPath)).toHaveLength(1);
        // No session_meta head: not a confirmed classification, so it is checked again.
        expect(opened.filter(p => p === headlessPath)).toHaveLength(2);
      });

      it("re-checks a cached session head after the file shrinks", async () => {
        const root = makeRoot();
        const filePath = path.join(root, "rollout.jsonl");
        writeJsonl(filePath, [
          sessionMeta(),
          taskStarted(recent, rootTurn("composer")),
          taskStarted(recent, rootTurn("composer")),
        ]);

        const openSpy = vi.spyOn(fs.promises, "open");
        const adapter = new CodexProviderAdapter(() => root);
        expect((await collect(adapter)).weekly).toBe(2);

        // Replaced by a shorter subagent session.
        writeJsonl(filePath, [sessionMeta({ subagent: {} }), taskStarted(recent)]);
        expect((await collect(adapter)).weekly).toBe(0);
        expect(openedPaths(openSpy).filter(p => p === filePath)).toHaveLength(2);
      });

      it("never opens a session file last modified before the weekly window", async () => {
        const root = makeRoot();
        const currentPath = path.join(root, "current.jsonl");
        const oldPath = path.join(root, "old.jsonl");
        writeJsonl(currentPath, [sessionMeta(), taskStarted(recent, rootTurn("composer"))]);
        writeJsonl(oldPath, [sessionMeta(), taskStarted(stale, rootTurn("composer"))]);
        const oldTime = new Date(stale);
        fs.utimesSync(oldPath, oldTime, oldTime);

        const openSpy = vi.spyOn(fs.promises, "open");
        const { result, weekly: weeklyCount } = await collect(new CodexProviderAdapter(() => root));

        expect(weeklyCount).toBe(1);
        expect(result.snapshots[0]?.details?.filesScanned).toBe(1);
        expect(openedPaths(openSpy)).not.toContain(oldPath);
      });
    });
  });
});
