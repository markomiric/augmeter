import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotProviderAdapter } from "../../providers/adapters/copilot-provider-adapter";

describe("CopilotProviderAdapter", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;

    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("parses cumulative request counters from sqlite query output", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-copilot-"));
    tempDirs.push(root);

    const dbPath = path.join(root, "state.vscdb");
    fs.writeFileSync(dbPath, "", "utf8");

    const queryOutput = JSON.stringify([
      {
        key: "languageModelStats.copilot-gpt-4",
        value: JSON.stringify({
          extensions: [
            {
              requestCount: 0,
              participants: [{ requestCount: 3 }, { requestCount: 2 }],
            },
          ],
        }),
      },
      {
        key: "languageModelStats.copilot-gpt-5",
        value: JSON.stringify({
          extensions: [
            {
              requestCount: 4,
              participants: [{ requestCount: 1 }],
            },
          ],
        }),
      },
    ]);

    const adapter = new CopilotProviderAdapter(
      () => dbPath,
      async () => {
        return queryOutput;
      }
    );

    const result = await adapter.collectUsage({
      now: new Date("2026-02-16T12:00:00.000Z"),
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(result.health.status).toBe("connected");
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]?.windowType).toBe("custom");
    expect(result.snapshots[0]?.used).toBe(9);
  });

  it("returns restricted health in untrusted workspaces", async () => {
    const adapter = new CopilotProviderAdapter(() => "/does/not/matter");

    const result = await adapter.collectUsage({
      now: new Date(),
      workspaceTrusted: false,
      forceRefresh: true,
    });

    expect(result.snapshots).toHaveLength(0);
    expect(result.health.status).toBe("restricted");
  });

  it("returns degraded health when local sqlite query is unavailable", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-copilot-no-sqlite-"));
    tempDirs.push(root);
    const dbPath = path.join(root, "state.vscdb");
    fs.writeFileSync(dbPath, "", "utf8");

    const adapter = new CopilotProviderAdapter(
      () => dbPath,
      async () => {
        const error = new Error("spawn sqlite3 ENOENT") as Error & { code: string };
        error.code = "ENOENT";
        throw error;
      }
    );

    const result = await adapter.collectUsage({
      now: new Date("2026-02-16T12:00:00.000Z"),
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(result.snapshots).toHaveLength(0);
    expect(result.health.status).toBe("degraded");
    expect(result.health.message).toContain(
      "Install sqlite3 to read local GitHub Copilot activity"
    );
  });

  it("prefers GitHub API usage when configured", async () => {
    process.env.GITHUB_TOKEN = "ghp_example_token";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-copilot-api-"));
    tempDirs.push(root);
    const dbPath = path.join(root, "state.vscdb");
    fs.writeFileSync(dbPath, "", "utf8");

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          total_usage: 42,
          total_available: 58,
          start_date: "2026-02-01",
          end_date: "2026-03-01",
        }),
        { status: 200 }
      );
    });

    const adapter = new CopilotProviderAdapter(
      () => dbPath,
      async () => {
        throw new Error("should not use sqlite fallback when API succeeds");
      },
      () => ({
        enabled: true,
        username: "octocat",
        tokenEnvVar: "GITHUB_TOKEN",
        baseUrl: "https://api.github.com",
        timeoutMs: 6000,
      }),
      fetchMock
    );

    const result = await adapter.collectUsage({
      now: new Date("2026-02-16T12:00:00.000Z"),
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.health.status).toBe("connected");
    expect(result.health.sourceKind).toBe("api");
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]?.used).toBe(42);
    expect(result.snapshots[0]?.remaining).toBe(58);
    expect(result.snapshots[0]?.windowType).toBe("monthly");
  });

  it("preserves API path prefixes for GitHub Enterprise base URLs", async () => {
    process.env.GITHUB_TOKEN = "ghp_example_token";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "augmeter-copilot-ghe-"));
    tempDirs.push(root);
    const dbPath = path.join(root, "state.vscdb");
    fs.writeFileSync(dbPath, "", "utf8");

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          total_usage: 5,
          total_available: 15,
          start_date: "2026-02-01",
          end_date: "2026-03-01",
        }),
        { status: 200 }
      );
    });

    const adapter = new CopilotProviderAdapter(
      () => dbPath,
      async () => {
        throw new Error("should not use sqlite fallback when API succeeds");
      },
      () => ({
        enabled: true,
        username: "octocat",
        tokenEnvVar: "GITHUB_TOKEN",
        baseUrl: "https://ghe.example.com/api/v3/",
        timeoutMs: 6000,
      }),
      fetchMock
    );

    await adapter.collectUsage({
      now: new Date("2026-02-16T12:00:00.000Z"),
      workspaceTrusted: true,
      forceRefresh: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://ghe.example.com/api/v3/users/octocat/settings/billing/premium_request/usage"
    );
  });
});
