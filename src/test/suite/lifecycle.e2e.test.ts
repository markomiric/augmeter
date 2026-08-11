import * as assert from "node:assert";
import { createServer, type Server } from "node:http";
import * as vscode from "vscode";

type FixtureMode = "success" | "outage";

interface UsageFixture {
  server: Server;
  baseUrl: string;
  setMode(mode: FixtureMode): void;
  setUsed(used: number): void;
  getAuthenticatedRequestCount(): number;
}

const COOKIE_VALUE = "augmeter-e2e-session-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SETTINGS = [
  "enabled",
  "dataSource",
  "apiBaseUrl",
  "providers.enabled",
  "smartSignIn.quickWatchMs",
] as const;

suite("Augment connection lifecycle E2E Test Suite", () => {
  test("connects, preserves stale data during an outage, recovers, and disconnects", async () => {
    const fixture = await startUsageFixture();
    const config = vscode.workspace.getConfiguration("augmeter");
    const previousClipboard = await vscode.env.clipboard.readText();
    const previousSettings = new Map(
      SETTINGS.map(key => [key, config.inspect(key)?.globalValue] as const)
    );

    try {
      await vscode.commands.executeCommand("augmeter.signOut");
      await config.update("enabled", true, vscode.ConfigurationTarget.Global);
      await config.update("dataSource", "cookie", vscode.ConfigurationTarget.Global);
      await config.update("apiBaseUrl", fixture.baseUrl, vscode.ConfigurationTarget.Global);
      await config.update("providers.enabled", false, vscode.ConfigurationTarget.Global);
      await config.update("smartSignIn.quickWatchMs", 250, vscode.ConfigurationTarget.Global);

      await vscode.commands.executeCommand("augmeter.openUsageDashboard");
      await vscode.env.clipboard.writeText(`_session=${COOKIE_VALUE}`);
      await vscode.commands.executeCommand("augmeter.smartSignIn");

      assert.ok(
        fixture.getAuthenticatedRequestCount() >= 2,
        "The real connection and refresh paths should both reach the authenticated fixture"
      );
      assert.match(await copyUsageSummary(), /Used: 820 of 1,000 credits \(82%\)/);

      fixture.setMode("outage");
      const outageResult = await vscode.commands.executeCommand<boolean>("augmeter.manualRefresh");
      assert.strictEqual(outageResult, false, "An upstream outage should report a stale refresh");
      assert.match(
        await copyUsageSummary(),
        /Used: 820 of 1,000 credits \(82%\)/,
        "The last good data should remain visible during an outage"
      );

      fixture.setUsed(900);
      fixture.setMode("success");
      const recoveryResult =
        await vscode.commands.executeCommand<boolean>("augmeter.manualRefresh");
      assert.strictEqual(recoveryResult, true, "A recovered upstream should report success");
      assert.match(await copyUsageSummary(), /Used: 900 of 1,000 credits \(90%\)/);

      await vscode.commands.executeCommand("augmeter.signOut");
      const disconnectedResult =
        await vscode.commands.executeCommand<boolean>("augmeter.manualRefresh");
      assert.strictEqual(disconnectedResult, false, "A disconnected refresh should report failure");
    } finally {
      await vscode.commands.executeCommand("augmeter.signOut");
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      for (const key of SETTINGS) {
        await config.update(key, previousSettings.get(key), vscode.ConfigurationTarget.Global);
      }
      await vscode.env.clipboard.writeText(previousClipboard);
      await closeServer(fixture.server);
    }
  });
});

async function copyUsageSummary(): Promise<string> {
  await vscode.env.clipboard.writeText("");
  await vscode.commands.executeCommand("augmeter.copyUsageSummary");
  return await vscode.env.clipboard.readText();
}

async function startUsageFixture(): Promise<UsageFixture> {
  let mode: FixtureMode = "success";
  let used = 820;
  let authenticatedRequestCount = 0;

  const server = createServer((request, response) => {
    if (request.url !== "/api/credits") {
      response.writeHead(404).end();
      return;
    }

    if (!request.headers.cookie?.includes(`_session=${COOKIE_VALUE}`)) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "missing fixture cookie" }));
      return;
    }
    authenticatedRequestCount += 1;

    if (mode === "outage") {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "fixture outage" }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        usage: {
          used,
          limit: 1000,
          updatedAt: new Date().toISOString(),
        },
        plan: "Team",
        renewalDate: "2026-09-01T00:00:00.000Z",
      })
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object", "Fixture server should have a TCP address");

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api`,
    setMode(nextMode) {
      mode = nextMode;
    },
    setUsed(nextUsed) {
      used = nextUsed;
    },
    getAuthenticatedRequestCount() {
      return authenticatedRequestCount;
    },
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}
