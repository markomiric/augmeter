import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { UsageCommands } from "../commands/usage-commands";

describe("UsageCommands dashboard", () => {
  it("rerenders an open dashboard when usage changes", async () => {
    const model = {
      hasRealData: false,
      usage: 0,
      limit: 0,
      providerSnapshots: [] as Array<Record<string, unknown>>,
      providerHealth: [] as Array<Record<string, unknown>>,
    };
    let onChanged: (() => void) | undefined;
    const usageTracker = {
      onChanged: vi.fn((listener: () => void) => {
        onChanged = listener;
        return { dispose: vi.fn() };
      }),
      getUsageSnapshots: vi.fn(async () => []),
      getProviderUsageSnapshots: vi.fn(async () => model.providerSnapshots),
      getProviderHealthSnapshots: vi.fn(async () => model.providerHealth),
      hasRealUsageData: vi.fn(() => model.hasRealData),
      getCurrentUsage: vi.fn(() => model.usage),
      getCurrentLimit: vi.fn(() => model.limit),
      getRemainingCredits: vi.fn(() => model.limit - model.usage),
      getUsageRate: vi.fn(async () => null),
      getProjectedDaysRemaining: vi.fn(async () => null),
      getProjectedDepletionDate: vi.fn(async () => null),
      isCurrentUsageKnown: vi.fn(() => model.hasRealData),
      getMonthlyAllowance: vi.fn(() => model.limit),
      getLastFetchedAt: vi.fn(() => new Date("2026-08-11T06:00:00.000Z")),
      getRenewalDate: vi.fn(() => undefined),
      getSubscriptionType: vi.fn(() => "Team"),
      getMonthlyTarget: vi.fn(() => 0),
      getTargetDelta: vi.fn(() => null),
      getTargetProgressPercent: vi.fn(() => null),
    };
    const panel = {
      reveal: vi.fn(),
      onDidDispose: vi.fn(),
      webview: { html: "" },
    };
    const htmlWrites: string[] = [];
    let panelHtml = "";
    Object.defineProperty(panel.webview, "html", {
      get: () => panelHtml,
      set: (value: string) => {
        panelHtml = value;
        htmlWrites.push(value);
      },
    });
    (
      vscode.window as typeof vscode.window & { createWebviewPanel: ReturnType<typeof vi.fn> }
    ).createWebviewPanel = vi.fn(() => panel);
    (vscode as typeof vscode & { ViewColumn: { Active: number } }).ViewColumn = { Active: 1 };

    const commands = new UsageCommands(
      usageTracker as never,
      {} as never,
      {} as never,
      {} as never
    );
    const disposables = commands.registerCommands();

    await vscode.commands.executeCommand("augmeter.openUsageDashboard");
    expect(panel.webview.html).toContain("Augment credits aren&#39;t connected");
    expect(onChanged).toBeTypeOf("function");
    expect(htmlWrites).toHaveLength(1);

    onChanged?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(htmlWrites).toHaveLength(1);

    model.hasRealData = true;
    model.usage = 820;
    model.limit = 1000;
    onChanged?.();

    await vi.waitFor(() => {
      expect(panel.webview.html).toContain("820");
      expect(panel.webview.html).not.toContain("Augment credits aren&#39;t connected");
    });
    expect(htmlWrites).toHaveLength(2);

    model.providerSnapshots = [
      {
        providerId: "augment",
        timestamp: "2026-08-11T06:25:00.000Z",
        windowType: "monthly",
        metricType: "credits",
        sourceKind: "api",
        used: 820,
        limit: 1000,
        remaining: 180,
      },
    ];
    onChanged?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(htmlWrites).toHaveLength(2);

    model.providerHealth = [
      {
        providerId: "claude",
        status: "disabled",
        checkedAt: "2026-08-11T06:30:00.000Z",
        canCollectInCurrentWorkspace: true,
        sourceKind: "unknown",
        message: "Claude Code activity tracking is off.",
      },
    ];
    onChanged?.();

    await vi.waitFor(() => {
      expect(panel.webview.html).toContain("activity tracking off");
    });
    expect(htmlWrites).toHaveLength(3);

    disposables.forEach(disposable => disposable.dispose());
  });

  it("warns when a manual refresh completes with stale data", async () => {
    vi.clearAllMocks();
    const usageTracker = {
      onChanged: vi.fn(() => ({ dispose: vi.fn() })),
      refreshNow: vi.fn(async () => false),
    };
    const statusBarManager = {
      updateDisplay: vi.fn(async () => undefined),
    };
    const commands = new UsageCommands(
      usageTracker as never,
      statusBarManager as never,
      {} as never,
      {} as never
    );
    const disposables = commands.registerCommands();

    const result = await vscode.commands.executeCommand<boolean>("augmeter.manualRefresh");

    expect(result).toBe(false);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "Some data couldn't be refreshed and may be out of date. Check Output > Augmeter for details."
    );
    expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalledWith(
      "✅ Assistant activity and Augment credits refreshed",
      expect.any(Number)
    );

    disposables.forEach(disposable => disposable.dispose());
  });
});
