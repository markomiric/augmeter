import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { UsageCommands } from "../commands/usage-commands";

describe("UsageCommands dashboard", () => {
  it("updates an open dashboard by message, including freshness, without replacing its document", async () => {
    const model = {
      hasRealData: false,
      usage: 0,
      limit: 0,
      providerSnapshots: [] as Array<Record<string, unknown>>,
      providerHealth: [] as Array<Record<string, unknown>>,
    };
    let onChanged: (() => void) | undefined;
    let onMessage: ((message: unknown) => Promise<void>) | undefined;
    let onViewState: ((event: { webviewPanel: { visible: boolean } }) => void) | undefined;
    let freshness = new Date("2026-08-11T06:00:00.000Z");
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
      getLastFetchedAt: vi.fn(() => freshness),
      getRenewalDate: vi.fn(() => undefined),
      getSubscriptionType: vi.fn(() => "Team"),
      getMonthlyTarget: vi.fn(() => 0),
      getTargetDelta: vi.fn(() => null),
      getTargetProgressPercent: vi.fn(() => null),
    };
    let displayedHtml = "";
    const updates: string[] = [];
    const panel = {
      reveal: vi.fn(),
      dispose: vi.fn(),
      onDidDispose: vi.fn(),
      onDidChangeViewState: vi.fn(listener => {
        onViewState = listener;
      }),
      webview: {
        html: "",
        onDidReceiveMessage: vi.fn(listener => {
          onMessage = listener;
        }),
        postMessage: vi.fn(async message => {
          if (message.type === "update") {
            displayedHtml = message.html;
            updates.push(message.html);
          }
          return true;
        }),
      },
    };
    const htmlWrites: string[] = [];
    let panelHtml = "";
    Object.defineProperty(panel.webview, "html", {
      get: () => panelHtml,
      set: (value: string) => {
        panelHtml = value;
        displayedHtml = value;
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
      { isEnabled: () => true } as never,
      { hasCookie: () => false } as never
    );
    const disposables = commands.registerCommands();

    await vscode.commands.executeCommand("augmeter.openUsageDashboard");
    expect(displayedHtml).toContain("Augment credits aren&#39;t connected");
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
      expect(displayedHtml).toContain("820");
      expect(displayedHtml).not.toContain("Augment credits aren&#39;t connected");
    });
    expect(htmlWrites).toHaveLength(1);

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
    expect(htmlWrites).toHaveLength(1);

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
      expect(displayedHtml).toContain("Activity tracking off");
    });
    expect(htmlWrites).toHaveLength(1);

    expect(updates.length).toBeGreaterThanOrEqual(2);
    freshness = new Date("2026-08-11T07:00:00.000Z");
    onChanged?.();
    await vi.waitFor(() => expect(displayedHtml).toContain(freshness.toLocaleString()));
    expect(htmlWrites).toHaveLength(1);

    const executed = vi.spyOn(vscode.commands, "executeCommand");
    executed.mockClear();
    await onMessage?.(null);
    await onMessage?.({ command: "workbench.action.terminal.new", args: ["untrusted"] });
    expect(executed).not.toHaveBeenCalled();
    await onMessage?.({ command: "augmeter.openSettings", args: ["ignored"] });
    expect(executed).toHaveBeenCalledWith("augmeter.openSettings");
    expect(executed).not.toHaveBeenCalledWith("augmeter.openSettings", expect.anything());
    executed.mockRestore();
    panel.webview.postMessage.mockResolvedValueOnce(false);
    model.usage = 900;
    onChanged?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    panel.webview.postMessage.mockClear();
    onViewState?.({ webviewPanel: { visible: true } });
    await vi.waitFor(() =>
      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "update", html: expect.stringContaining("900") })
      )
    );
    disposables.forEach(disposable => disposable.dispose());
    expect(panel.dispose).toHaveBeenCalledOnce();
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
      { isEnabled: () => true } as never,
      {} as never
    );
    const disposables = commands.registerCommands();

    const result = await vscode.commands.executeCommand<boolean>("augmeter.manualRefresh");

    expect(result).toBe(false);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      "Some data couldn't be refreshed and may be out of date. Check Output > Augmeter for details."
    );
    expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalledWith(
      "✅ Enabled assistant activity and credit sources refreshed",
      expect.any(Number)
    );

    disposables.forEach(disposable => disposable.dispose());
  });

  it("explains paused collection without starting a refresh", async () => {
    const refreshNow = vi.fn();
    const commands = new UsageCommands(
      { onChanged: () => ({ dispose() {} }), refreshNow } as never,
      {} as never,
      { isEnabled: () => false } as never,
      {} as never
    );
    const disposables = commands.registerCommands();
    expect(await vscode.commands.executeCommand("augmeter.manualRefresh")).toBe(false);
    expect(refreshNow).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Augmeter is paused. Enable it in Settings to refresh."
    );
    disposables.forEach(disposable => disposable.dispose());
  });
});
