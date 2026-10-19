import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { RuntimeCoordinator } from "../bootstrap/runtime-coordinator";
import { AuthCommands } from "../commands/auth-commands";
import { buildDiagnosticsPayload, buildUsageBundle } from "../commands/usage-command-formatters";
import { UsageCommands } from "../commands/usage-commands";
import type { ConfigManager } from "../core/config/config-manager";
import type { StorageManager } from "../core/storage/storage-manager";
import type { ProviderUsageService } from "../providers/provider-usage-service";
import type { AuggieCliSource } from "../services/auggie-cli-source";
import type { AugmentApiClient } from "../services/augment-api-client";
import { UsageTracker } from "../features/usage/usage-tracker";
import { StatusBarManager } from "../ui/status-bar";
import { buildMarkdownTooltip } from "../ui/status-bar-logic";
import { renderUsageDashboard } from "../ui/usage-dashboard";

const OFF_MESSAGE = "Augment credit tracking is a legacy option and is turned off.";
const LOCAL_LINES = ["Claude Code: 3 turns in 5 hours", "Codex: 9 turns in 7 days"];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("Augment legacy opt-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("one-time migration", () => {
    function setup(options: {
      done?: boolean;
      explicit?: boolean;
      creditSnapshots?: unknown[];
      augmentSnapshots?: unknown[];
      cookie?: string | undefined;
      secretError?: boolean;
      writeError?: boolean;
    }) {
      const storageManager = {
        isAugmentLegacyMigrationDone: vi.fn(() => options.done ?? false),
        setAugmentLegacyMigrationDone: vi.fn(async () => {}),
        getUsageSnapshots: vi.fn(async () => options.creditSnapshots ?? []),
        getProviderUsageSnapshots: vi.fn(async () => options.augmentSnapshots ?? []),
      };
      const configManager = {
        hasExplicitAugmentEnabled: vi.fn(() => options.explicit ?? false),
        setAugmentEnabled: vi.fn(async () => {
          if (options.writeError) throw new Error("settings write failed");
        }),
      };
      const secrets = {
        get: vi.fn(async () => {
          if (options.secretError) throw new Error("keychain unavailable");
          return options.cookie;
        }),
      };
      const coordinator = new RuntimeCoordinator(
        { secrets } as never,
        storageManager as unknown as StorageManager,
        configManager as unknown as ConfigManager,
        { hasCookie: () => false } as unknown as AugmentApiClient,
        {} as UsageTracker,
        {} as never,
        {} as ProviderUsageService,
        {} as AuggieCliSource
      );
      const migrate = () =>
        (
          coordinator as unknown as { migrateAugmentLegacyOptIn(): Promise<void> }
        ).migrateAugmentLegacyOptIn();
      return { storageManager, configManager, secrets, migrate };
    }

    it.each<[string, Parameters<typeof setup>[0]]>([
      ["credit snapshots", { creditSnapshots: [{ timestamp: "2026-10-01T00:00:00.000Z" }] }],
      [
        "balance-only Augment provider snapshots",
        { augmentSnapshots: [{ providerId: "augment" }] },
      ],
      ["a stored session cookie", { cookie: "synthetic-cookie" }],
    ])("turns Augment on once for an existing user with %s", async (_name, options) => {
      const { configManager, storageManager, migrate } = setup(options);

      await migrate();

      expect(configManager.setAugmentEnabled).toHaveBeenCalledOnce();
      expect(configManager.setAugmentEnabled).toHaveBeenCalledWith(true);
      expect(storageManager.setAugmentLegacyMigrationDone).toHaveBeenCalledOnce();
    });

    it("never overwrites an explicit value", async () => {
      const { configManager, storageManager, migrate } = setup({
        explicit: true,
        cookie: "synthetic-cookie",
      });

      await migrate();

      expect(configManager.setAugmentEnabled).not.toHaveBeenCalled();
      expect(storageManager.setAugmentLegacyMigrationDone).toHaveBeenCalledOnce();
    });

    it("writes nothing for a user without Augment data", async () => {
      const { configManager, storageManager, migrate } = setup({});

      await migrate();

      expect(configManager.setAugmentEnabled).not.toHaveBeenCalled();
      expect(storageManager.setAugmentLegacyMigrationDone).toHaveBeenCalledOnce();
    });

    it("turns Augment on from stored credit data without reading the secret", async () => {
      const { configManager, storageManager, secrets, migrate } = setup({
        secretError: true,
        creditSnapshots: [{}],
      });

      await migrate();

      expect(secrets.get).not.toHaveBeenCalled();
      expect(configManager.setAugmentEnabled).toHaveBeenCalledWith(true);
      expect(storageManager.setAugmentLegacyMigrationDone).toHaveBeenCalledOnce();
    });

    it("leaves the flag unset after a secret-read failure so it retries", async () => {
      const failing = setup({ secretError: true });
      await expect(failing.migrate()).resolves.toBeUndefined();
      expect(failing.configManager.setAugmentEnabled).not.toHaveBeenCalled();
      expect(failing.storageManager.setAugmentLegacyMigrationDone).not.toHaveBeenCalled();

      // Next activation: the read succeeds and the migration completes.
      const retried = setup({ cookie: "synthetic-cookie" });
      await retried.migrate();
      expect(retried.configManager.setAugmentEnabled).toHaveBeenCalledWith(true);
      expect(retried.storageManager.setAugmentLegacyMigrationDone).toHaveBeenCalledOnce();
    });

    it("leaves the flag unset after a setting-write failure so it retries", async () => {
      const { configManager, storageManager, migrate } = setup({
        writeError: true,
        cookie: "synthetic-cookie",
      });

      await expect(migrate()).resolves.toBeUndefined();

      expect(configManager.setAugmentEnabled).toHaveBeenCalledOnce();
      expect(storageManager.setAugmentLegacyMigrationDone).not.toHaveBeenCalled();
    });

    it("does not run again after it succeeded", async () => {
      const { configManager, storageManager, secrets, migrate } = setup({
        done: true,
        cookie: "synthetic-cookie",
      });

      await migrate();

      expect(secrets.get).not.toHaveBeenCalled();
      expect(storageManager.getUsageSnapshots).not.toHaveBeenCalled();
      expect(configManager.setAugmentEnabled).not.toHaveBeenCalled();
      expect(storageManager.setAugmentLegacyMigrationDone).not.toHaveBeenCalled();
    });
  });

  describe("fetch gate", () => {
    function setup(options: { enabled: { value: boolean }; dataSource?: string }) {
      let fetcher: (() => Promise<boolean>) | undefined;
      const usageTracker = {
        getFetchSource: () => "manual",
        setRealDataFetcher: vi.fn((next: () => Promise<boolean>) => {
          fetcher = next;
        }),
        clearRealDataFlag: vi.fn(),
        notifyChanged: vi.fn(),
        updateWithRealData: vi.fn(async () => {}),
      };
      const storageManager = {
        isCliAuthDisabled: () => false,
        setProviderHealth: vi.fn(async () => {}),
        getProviderHealth: vi.fn(async () => null),
        removeProviderHealth: vi.fn(async () => {}),
      };
      const auggieCliSource = {
        fetchUsage: vi.fn(),
        getFetchGeneration: () => 0,
        isFetchGenerationCurrent: () => true,
      };
      const apiClient = {
        hasCookie: () => true,
        getUsageData: vi.fn(),
        parseUsageResponse: vi.fn(),
        getRequestGeneration: () => 0,
        isRequestGenerationCurrent: () => true,
      };
      const providerUsageService = { collectUsage: vi.fn(async () => {}) };
      const statusBarManager = { updateDisplay: vi.fn(async () => {}) };
      const coordinator = new RuntimeCoordinator(
        {} as never,
        storageManager as unknown as StorageManager,
        {
          getDataSource: () => options.dataSource ?? "auto",
          isAugmentEnabled: () => options.enabled.value,
          isEnabled: () => true,
          isProviderTrackingEnabled: () => false,
          getEnabledProviderIds: () => [],
        } as unknown as ConfigManager,
        apiClient as unknown as AugmentApiClient,
        usageTracker as unknown as UsageTracker,
        statusBarManager as never,
        providerUsageService as unknown as ProviderUsageService,
        auggieCliSource as unknown as AuggieCliSource
      );
      (coordinator as unknown as { attachRealDataFetcher(): void }).attachRealDataFetcher();
      return {
        fetch: () => fetcher!(),
        usageTracker,
        storageManager,
        auggieCliSource,
        apiClient,
        providerUsageService,
        statusBarManager,
      };
    }

    it("skips the Auggie CLI and the Augment API when Augment is off", async () => {
      const ctx = setup({ enabled: { value: false } });

      await expect(ctx.fetch()).resolves.toBe(true);

      expect(ctx.auggieCliSource.fetchUsage).not.toHaveBeenCalled();
      expect(ctx.apiClient.getUsageData).not.toHaveBeenCalled();
      expect(ctx.usageTracker.clearRealDataFlag).toHaveBeenCalledOnce();
      expect(ctx.storageManager.setProviderHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "augment",
          status: "disabled",
          message: "Augment credit tracking (legacy) is off.",
        })
      );
      // Local providers, the status bar and change notification still run.
      expect(ctx.providerUsageService.collectUsage).toHaveBeenCalledOnce();
      expect(ctx.statusBarManager.updateDisplay).toHaveBeenCalledOnce();
      expect(ctx.usageTracker.notifyChanged).toHaveBeenCalledOnce();
    });

    it("reports a provider-collection failure while Augment is off", async () => {
      const ctx = setup({ enabled: { value: false } });
      ctx.providerUsageService.collectUsage.mockRejectedValue(new Error("storage write failed"));

      await expect(ctx.fetch()).resolves.toBe(false);
    });

    it("keeps the signed-in context while Augment is off", async () => {
      const ctx = setup({ enabled: { value: false } });

      await ctx.fetch();

      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "setContext",
        "augmeter.isSignedIn",
        false
      );
    });

    it("clears the stored off health once Augment is on again", async () => {
      const ctx = setup({ enabled: { value: true }, dataSource: "cookie" });
      ctx.storageManager.getProviderHealth.mockResolvedValue({
        providerId: "augment",
        errorCode: "AUGMENT_LEGACY_OFF",
      } as never);
      ctx.apiClient.getUsageData.mockResolvedValue({ success: false, error: "synthetic" });

      await ctx.fetch();

      expect(ctx.storageManager.removeProviderHealth).toHaveBeenCalledWith("augment");
    });

    it("lets the Augment API stop retrying once Augment is turned off", async () => {
      const enabled = { value: true };
      const ctx = setup({ enabled, dataSource: "cookie" });
      ctx.apiClient.getUsageData.mockResolvedValue({ success: false, error: "synthetic" });

      await ctx.fetch();

      const [shouldContinue] = ctx.apiClient.getUsageData.mock.calls[0] as [() => boolean];
      expect(shouldContinue()).toBe(true);
      enabled.value = false;
      expect(shouldContinue()).toBe(false);
    });

    it("runs the Auggie CLI when Augment is on", async () => {
      const ctx = setup({ enabled: { value: true } });
      ctx.auggieCliSource.fetchUsage.mockResolvedValue({ status: "cli-missing" });
      ctx.apiClient.getUsageData.mockResolvedValue({ success: false, error: "synthetic" });

      await ctx.fetch();

      expect(ctx.auggieCliSource.fetchUsage).toHaveBeenCalledOnce();
      expect(ctx.apiClient.getUsageData).toHaveBeenCalledOnce();
    });

    it("discards an Auggie CLI result that arrives after Augment was turned off", async () => {
      const enabled = { value: true };
      const ctx = setup({ enabled });
      const pending = deferred<unknown>();
      ctx.auggieCliSource.fetchUsage.mockReturnValue(pending.promise);

      const run = ctx.fetch();
      await vi.waitFor(() => expect(ctx.auggieCliSource.fetchUsage).toHaveBeenCalled());
      enabled.value = false;
      pending.resolve({ status: "ok", data: { totalUsage: 10, usageLimit: 100 } });
      await run;

      expect(ctx.usageTracker.updateWithRealData).not.toHaveBeenCalled();
      expect(ctx.storageManager.setProviderHealth).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: "connected" })
      );
      expect(ctx.storageManager.setProviderHealth).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: "augment", status: "disabled" })
      );
    });

    it("discards an Augment API response that arrives after Augment was turned off", async () => {
      const enabled = { value: true };
      const ctx = setup({ enabled, dataSource: "cookie" });
      const pending = deferred<unknown>();
      ctx.apiClient.getUsageData.mockReturnValue(pending.promise);

      const run = ctx.fetch();
      await vi.waitFor(() => expect(ctx.apiClient.getUsageData).toHaveBeenCalled());
      enabled.value = false;
      pending.resolve({ success: true, data: { usage: 1 } });
      await run;

      expect(ctx.apiClient.parseUsageResponse).not.toHaveBeenCalled();
      expect(ctx.usageTracker.updateWithRealData).not.toHaveBeenCalled();
    });
  });

  describe("shared opt-in guard", () => {
    function setup(options: { choice?: string }) {
      const calls = { testConnection: 0, fetchUsage: 0, detectBinary: 0 };
      const configManager = {
        isAugmentEnabled: vi.fn(() => false),
        setAugmentEnabled: vi.fn(async () => {}),
        getSmartSignInQuickWatchMs: () => 0,
        getSmartSignInWebsiteWatchMs: () => 0,
        getDataSource: () => "auggie-cli",
      };
      const auggieCliSource = {
        detectBinary: vi.fn(async () => {
          calls.detectBinary++;
          return null;
        }),
        fetchUsage: vi.fn(async () => {
          calls.fetchUsage++;
          return { status: "cli-missing" };
        }),
        isAuthenticatedCached: () => false,
        reset: () => {},
      };
      const apiClient = {
        hasCookie: () => true,
        testConnection: vi.fn(async () => {
          calls.testConnection++;
          return { success: true };
        }),
      };
      vi.mocked(vscode.window.showInformationMessage).mockImplementation(
        async () => options.choice as never
      );
      const auth = new AuthCommands(
        apiClient as never,
        { refreshNow: async () => {} } as never,
        { showLoading: () => {}, updateDisplay: async () => {} } as never,
        configManager as never,
        auggieCliSource as never,
        { isCliAuthDisabled: () => false, setCliAuthDisabled: async () => {} } as never
      );
      const disposables = auth.registerCommands();
      return { calls, configManager, auggieCliSource, disposables };
    }

    it.each(["augmeter.signIn", "augmeter.smartSignIn", "augmeter.openWebsiteAndSignIn"])(
      "%s only offers to turn Augment on while it is off",
      async command => {
        const { calls, configManager, disposables } = setup({ choice: undefined });

        await vscode.commands.executeCommand(command);

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(OFF_MESSAGE, "Turn On");
        expect(configManager.setAugmentEnabled).not.toHaveBeenCalled();
        expect(calls).toEqual({ testConnection: 0, fetchUsage: 0, detectBinary: 0 });
        disposables.forEach(d => d.dispose());
      }
    );

    it("Turn On enables Augment (Global) and continues the connect flow", async () => {
      const { calls, configManager, disposables } = setup({ choice: "Turn On" });

      await vscode.commands.executeCommand("augmeter.signIn");

      expect(configManager.setAugmentEnabled).toHaveBeenCalledWith(true);
      expect(calls.detectBinary + calls.fetchUsage + calls.testConnection).toBeGreaterThan(0);
      disposables.forEach(d => d.dispose());
    });

    it("signOut clears a stored cookie while Augment is off without any request", async () => {
      const calls = { testConnection: 0, getUsageData: 0, fetchUsage: 0, detectBinary: 0 };
      const apiClient = {
        hasCookie: () => true,
        clearSessionCookie: vi.fn(async () => {}),
        testConnection: vi.fn(async () => {
          calls.testConnection++;
          return { success: true };
        }),
        getUsageData: vi.fn(async () => {
          calls.getUsageData++;
          return { success: false };
        }),
      };
      const auggieCliSource = {
        detectBinary: vi.fn(async () => {
          calls.detectBinary++;
          return null;
        }),
        fetchUsage: vi.fn(async () => {
          calls.fetchUsage++;
          return { status: "cli-missing" };
        }),
        isAuthenticatedCached: () => false,
        reset: () => {},
      };
      const auth = new AuthCommands(
        apiClient as never,
        { resetUsage: vi.fn(async () => {}), clearRealDataFlag: vi.fn() } as never,
        { updateDisplay: vi.fn(async () => {}) } as never,
        { isAugmentEnabled: () => false, setAugmentEnabled: vi.fn() } as never,
        auggieCliSource as never,
        { setCliAuthDisabled: vi.fn(async () => {}) } as never
      );
      const disposables = auth.registerCommands();

      await vscode.commands.executeCommand("augmeter.signOut");

      expect(apiClient.clearSessionCookie).toHaveBeenCalledTimes(1);
      expect(calls).toEqual({ testConnection: 0, getUsageData: 0, fetchUsage: 0, detectBinary: 0 });
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(OFF_MESSAGE, "Turn On");
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "setContext",
        "augmeter.isSignedIn",
        false
      );
      disposables.forEach(d => d.dispose());
    });

    it("copyUsageSummary does not start sign-in or copy while Augment is off", async () => {
      vi.mocked(vscode.window.showInformationMessage).mockImplementation(async () => undefined);
      const usageTracker = {
        onChanged: vi.fn(() => ({ dispose: vi.fn() })),
        hasRealUsageData: vi.fn(() => false),
        getCurrentUsage: vi.fn(() => 0),
        getCurrentLimit: vi.fn(() => 0),
      };
      const commands = new UsageCommands(
        usageTracker as never,
        {} as never,
        { isAugmentEnabled: () => false, setAugmentEnabled: vi.fn() } as never,
        {} as never
      );
      const disposables = commands.registerCommands();

      await vscode.commands.executeCommand("augmeter.copyUsageSummary");

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(OFF_MESSAGE, "Turn On");
      expect(usageTracker.hasRealUsageData).not.toHaveBeenCalled();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith("augmeter.smartSignIn");
      expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
      disposables.forEach(d => d.dispose());
    });
  });

  describe("presentation", () => {
    const base = {
      used: 820,
      limit: 1000,
      remaining: 180,
      percentage: 82,
      hasRealData: true,
      clickAction: "refresh" as const,
      subscriptionType: "Team",
      providerUsageLines: LOCAL_LINES,
    };

    it("tooltip has no Augment text when off and legacy headings when on", () => {
      const off = buildMarkdownTooltip({ ...base, augmentEnabled: false });
      expect(off).not.toContain("Augment");
      expect(off).toContain("- Claude Code: 3 turns in 5 hours");
      expect(off).toContain("Click to open assistant usage");

      const offDisconnected = buildMarkdownTooltip({
        ...base,
        hasRealData: false,
        augmentEnabled: false,
      });
      expect(offDisconnected).not.toContain("Augment");

      const on = buildMarkdownTooltip({ ...base, augmentEnabled: true });
      expect(on).toContain("**Augment credits (legacy)**");
      expect(buildMarkdownTooltip({ ...base, hasRealData: false })).toContain(
        "**Augment credits (legacy):** Not connected"
      );
    });

    const dashboardData = {
      generatedAt: new Date("2026-10-18T10:00:00.000Z"),
      usage: 820,
      limit: 1000,
      remaining: 180,
      percentage: 82,
      usageKnown: true,
      subscriptionType: "Team",
      snapshots: [],
      providerSnapshots: [
        {
          providerId: "claude",
          timestamp: "2026-10-18T09:59:00.000Z",
          windowType: "weekly_7d" as const,
          metricType: "messages" as const,
          sourceKind: "file" as const,
          used: 9,
        },
      ],
    };

    it("dashboard has no Augment text when off, connected or not", () => {
      for (const hasRealData of [true, false]) {
        const html = renderUsageDashboard({ ...dashboardData, hasRealData, augmentEnabled: false });
        expect(html).not.toContain("Augment");
        expect(html).toContain("Claude Code");
      }
    });

    it("dashboard shows legacy headings and one legacy notice when on", () => {
      const notice =
        "Augment changed how it bills usage, so credit data may be incomplete or stop updating.";
      const connected = renderUsageDashboard({
        ...dashboardData,
        hasRealData: true,
        augmentEnabled: true,
      });
      expect(connected.split("<h2>Augment credits (legacy)</h2>")).toHaveLength(2);
      expect(connected).toContain("<h2>Augment credit trends (legacy)</h2>");
      expect(connected.split(notice)).toHaveLength(2);
      expect(connected).not.toContain('class="notice-card"');
      expect(connected).not.toContain("aren&#39;t connected");

      const disconnected = renderUsageDashboard({
        ...dashboardData,
        hasRealData: false,
        augmentEnabled: true,
      });
      expect(disconnected).toContain("Augment credits aren&#39;t connected");
      expect(disconnected.split(notice)).toHaveLength(2);
    });

    it("status bar shows the plain Augmeter state with an Augment-free label when off", async () => {
      const item = {
        text: "",
        tooltip: undefined as unknown,
        command: undefined as unknown,
        accessibilityInformation: undefined as unknown,
        color: undefined as unknown,
        backgroundColor: undefined as unknown,
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      };
      const vscodeMock = vscode as unknown as Record<string, unknown> & {
        window: Record<string, unknown>;
      };
      vscodeMock.window.createStatusBarItem = vi.fn(() => item);
      vscodeMock.StatusBarAlignment = { Left: 1, Right: 2 };
      vscodeMock.MarkdownString = class {
        isTrusted = false;
        constructor(public value: string) {}
      };
      const usageTracker = {
        onChanged: vi.fn(() => ({ dispose: vi.fn() })),
        getProviderUsageSnapshots: vi.fn(async () => []),
        getProviderHealthSnapshots: vi.fn(async () => []),
        hasRealUsageData: vi.fn(() => true),
      };
      const apiClient = { hasCookie: vi.fn(() => true) };
      const statusBar = new StatusBarManager(
        usageTracker as never,
        {
          isEnabled: () => true,
          shouldShowInStatusBar: () => true,
          isAugmentEnabled: () => false,
          getClickAction: () => "refresh",
        } as never,
        apiClient as never
      );

      await statusBar.updateDisplay();

      expect(item.text).toBe("$(dashboard) Augmeter");
      expect(item.accessibilityInformation).toEqual({
        label: "Augmeter: Assistant usage",
      });
      expect(item.command).toBe("augmeter.openUsageDashboard");
      expect((item.tooltip as { value: string }).value).not.toContain("Augment");
      expect((item.tooltip as { isTrusted: unknown }).isTrusted).toEqual({
        enabledCommands: ["augmeter.openUsageDashboard"],
      });
      expect(apiClient.hasCookie).not.toHaveBeenCalled();

      statusBar.showLoading();
      expect(item.tooltip).toBe("Augmeter\n\nRefreshing assistant activity...");
      statusBar.dispose();
    });

    it("manual refresh copy does not mention Augment when off", async () => {
      const report = vi.fn();
      vi.mocked(vscode.window.withProgress).mockImplementation(
        (async (_options: unknown, task: (progress: unknown, token: unknown) => Promise<unknown>) =>
          await task({ report }, { isCancellationRequested: false })) as never
      );
      const commands = new UsageCommands(
        {
          onChanged: vi.fn(() => ({ dispose: vi.fn() })),
          refreshNow: vi.fn(async () => true),
        } as never,
        { updateDisplay: vi.fn(async () => {}) } as never,
        { isAugmentEnabled: () => false, isEnabled: () => true } as never,
        {} as never
      );
      const disposables = commands.registerCommands();

      await vscode.commands.executeCommand("augmeter.manualRefresh");

      const messages = [
        ...report.mock.calls.map(call => JSON.stringify(call)),
        ...vi.mocked(vscode.window.setStatusBarMessage).mock.calls.map(call => String(call[0])),
        ...vi.mocked(vscode.window.showInformationMessage).mock.calls.map(call => String(call[0])),
      ];
      expect(messages.join("\n")).toContain("Refreshing assistant activity...");
      expect(messages.join("\n")).not.toContain("Augment");
      disposables.forEach(d => d.dispose());
    });

    it("exports and diagnostics include augmentEnabled", () => {
      const bundle = buildUsageBundle({
        generatedAt: new Date("2026-10-18T10:00:00.000Z"),
        extensionVersion: "0.0.0-test",
        currentUsage: 0,
        currentLimit: 0,
        remainingCredits: 0,
        usageSnapshots: [],
        providerSnapshots: [],
        providerHealth: [],
        retentionDays: 35,
        alertThresholds: { warning: 75, high: 90, critical: 95 },
        runOutDays: 3,
        cycleTarget: 0,
        enabledProviders: ["claude"],
        copilotApiConfig: { enabled: false, username: "" },
        copilotTokenPresent: false,
        augmentEnabled: false,
      });
      expect(bundle.config.augmentEnabled).toBe(false);

      const diagnostics = buildDiagnosticsPayload({
        generatedAt: new Date("2026-10-18T10:00:00.000Z"),
        vscodeVersion: "1.104.1",
        nodeVersion: "v20.18.0",
        platform: "linux",
        workspaceTrusted: true,
        hasCookie: false,
        hasRealData: false,
        dataSource: "none",
        usage: { used: 0, limit: 0, remaining: 0 },
        config: {
          refreshInterval: 60,
          clickAction: "refresh",
          showInStatusBar: true,
          alertThresholds: { warning: 75, high: 90, critical: 95 },
          runOutDays: 3,
          cycleTarget: 0,
          retentionDays: 35,
          providerTrackingEnabled: true,
          enabledProviders: ["claude"],
          claudeProjectsPath: "(default)",
          codexSessionsPath: "(default)",
          copilotApi: { enabled: false, username: "", tokenPresent: false },
          augmentEnabled: true,
          logLevel: "info",
        },
        providerHealth: [],
        providerSnapshots: [],
        supportIssueUrl: "https://example.invalid/issues",
      });
      expect(diagnostics.config.augmentEnabled).toBe(true);
    });
  });

  describe("turning Augment off mid-flow", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not validate a cookie submitted after Augment was turned off", async () => {
      const enabled = { value: true };
      const apiClient = {
        hasCookie: () => false,
        setSessionCookie: vi.fn(),
        clearSessionCookie: vi.fn(async () => {}),
        testConnection: vi.fn(async () => ({ success: true })),
      };
      const usageTracker = { refreshNow: vi.fn(async () => {}) };
      const auth = new AuthCommands(
        apiClient as never,
        usageTracker as never,
        { showLoading: vi.fn(), updateDisplay: vi.fn(async () => {}) } as never,
        {
          isAugmentEnabled: () => enabled.value,
          setAugmentEnabled: vi.fn(),
          getSmartSignInQuickWatchMs: () => 0,
          getSmartSignInWebsiteWatchMs: () => 2_000,
          getDataSource: () => "cookie",
        } as never,
        { isAuthenticatedCached: () => false, reset: () => {} } as never,
        { isCliAuthDisabled: () => false, setCliAuthDisabled: async () => {} } as never
      );
      const disposables = auth.registerCommands();
      await vscode.env.clipboard.writeText("");
      const prompt = deferred<string | undefined>();
      vi.mocked(vscode.window.showInputBox).mockImplementation(() => prompt.promise as never);

      const run = vscode.commands.executeCommand("augmeter.signIn");
      await vi.waitFor(() => expect(vscode.window.showInputBox).toHaveBeenCalled());
      enabled.value = false;
      prompt.resolve("A".repeat(64));
      await run;

      expect(apiClient.testConnection).not.toHaveBeenCalled();
      expect(usageTracker.refreshNow).not.toHaveBeenCalled();
      expect(apiClient.setSessionCookie.mock.calls.length).toBeLessThanOrEqual(
        apiClient.clearSessionCookie.mock.calls.length
      );
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "setContext",
        "augmeter.isSignedIn",
        true
      );
      disposables.forEach(d => d.dispose());
    });

    it("does not start Auggie login when Augment is turned off while the picker is open", async () => {
      const enabled = { value: true };
      const terminal = { show: vi.fn(), sendText: vi.fn(), dispose: vi.fn() };
      const createTerminal = vi.fn(() => terminal);
      (vscode.window as unknown as Record<string, unknown>).createTerminal = createTerminal;
      vi.mocked(vscode.window.showQuickPick).mockImplementation((async (items: unknown[]) => {
        enabled.value = false;
        return items[0];
      }) as never);
      const auth = new AuthCommands(
        { hasCookie: () => false } as never,
        { refreshNow: vi.fn(async () => {}) } as never,
        { showLoading: vi.fn(), updateDisplay: vi.fn(async () => {}) } as never,
        {
          isAugmentEnabled: () => enabled.value,
          setAugmentEnabled: vi.fn(),
          getDataSource: () => "auggie-cli",
        } as never,
        {
          detectBinary: vi.fn(async () => "auggie"),
          fetchUsage: vi.fn(async () => ({ status: "unauthenticated" })),
          isAuthenticatedCached: () => false,
          reset: () => {},
        } as never,
        { isCliAuthDisabled: () => false, setCliAuthDisabled: async () => {} } as never
      );
      const disposables = auth.registerCommands();

      await vscode.commands.executeCommand("augmeter.signIn");

      expect(createTerminal).not.toHaveBeenCalled();
      expect(terminal.sendText).not.toHaveBeenCalled();
      disposables.forEach(d => d.dispose());
    });

    it("opens no website or prompt when Augment is turned off during the stored-cookie check", async () => {
      const enabled = { value: true };
      const apiClient = {
        hasCookie: () => true,
        clearSessionCookie: vi.fn(async () => {}),
        testConnection: vi.fn(async () => {
          enabled.value = false;
          return { success: false };
        }),
      };
      const auth = new AuthCommands(
        apiClient as never,
        { refreshNow: vi.fn(async () => {}) } as never,
        { showLoading: vi.fn(), updateDisplay: vi.fn(async () => {}) } as never,
        {
          isAugmentEnabled: () => enabled.value,
          setAugmentEnabled: vi.fn(),
          getSmartSignInQuickWatchMs: () => 2_000,
          getSmartSignInWebsiteWatchMs: () => 2_000,
          getDataSource: () => "cookie",
        } as never,
        { isAuthenticatedCached: () => false, reset: () => {} } as never,
        { isCliAuthDisabled: () => false, setCliAuthDisabled: async () => {} } as never
      );
      const disposables = auth.registerCommands();

      await vscode.commands.executeCommand("augmeter.smartSignIn");

      expect(apiClient.clearSessionCookie).not.toHaveBeenCalled();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "vscode.open",
        expect.anything()
      );
      expect(vscode.window.showInputBox).not.toHaveBeenCalled();
      disposables.forEach(d => d.dispose());
    });

    it("closes the cookie prompt when Augment is turned off", async () => {
      const enabled = { value: true };
      const apiClient = {
        hasCookie: () => false,
        setSessionCookie: vi.fn(),
        clearSessionCookie: vi.fn(async () => {}),
        testConnection: vi.fn(async () => ({ success: true })),
      };
      const auth = new AuthCommands(
        apiClient as never,
        { refreshNow: vi.fn(async () => {}) } as never,
        { showLoading: vi.fn(), updateDisplay: vi.fn(async () => {}) } as never,
        {
          isAugmentEnabled: () => enabled.value,
          setAugmentEnabled: vi.fn(),
          reloadConfig: vi.fn(),
          getSmartSignInQuickWatchMs: () => 0,
          getSmartSignInWebsiteWatchMs: () => 300_000,
          getDataSource: () => "cookie",
        } as never,
        { isAuthenticatedCached: () => false, reset: () => {} } as never,
        { isCliAuthDisabled: () => false, setCliAuthDisabled: async () => {} } as never
      );
      const disposables = auth.registerCommands();
      await vscode.env.clipboard.writeText("");
      vi.mocked(vscode.window.showInputBox).mockImplementation(
        () => new Promise(() => {}) as never
      );

      const run = vscode.commands.executeCommand("augmeter.signIn");
      await vi.waitFor(() => expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled());
      const listener = vi.mocked(vscode.workspace.onDidChangeConfiguration).mock.calls[0]![0];
      enabled.value = false;
      listener({ affectsConfiguration: (section: string) => section === "augmeter.augment" });
      await run;

      expect(apiClient.testConnection).not.toHaveBeenCalled();
      disposables.forEach(d => d.dispose());
    });

    it("stops polling the Auggie CLI after Augment was turned off", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout"] });
      const enabled = { value: true };
      const fetchUsage = vi.fn(async () => {
        if (fetchUsage.mock.calls.length === 2) {
          // First poll inside the login loop: the user turns Augment off meanwhile.
          enabled.value = false;
        }
        return { status: "unauthenticated" };
      });
      const terminal = { show: vi.fn(), sendText: vi.fn(), dispose: vi.fn() };
      (vscode.window as unknown as Record<string, unknown>).createTerminal = vi.fn(() => terminal);
      vi.mocked(vscode.window.showQuickPick).mockImplementation(
        (async (items: unknown[]) => items[0]) as never
      );
      const usageTracker = { refreshNow: vi.fn(async () => {}) };
      const auth = new AuthCommands(
        { hasCookie: () => false } as never,
        usageTracker as never,
        { showLoading: vi.fn(), updateDisplay: vi.fn(async () => {}) } as never,
        {
          isAugmentEnabled: () => enabled.value,
          setAugmentEnabled: vi.fn(),
          getDataSource: () => "auggie-cli",
        } as never,
        {
          detectBinary: vi.fn(async () => "auggie"),
          fetchUsage,
          isAuthenticatedCached: () => false,
          reset: () => {},
        } as never,
        { isCliAuthDisabled: () => false, setCliAuthDisabled: async () => {} } as never
      );
      const disposables = auth.registerCommands();

      const run = vscode.commands.executeCommand("augmeter.signIn");
      await vi.advanceTimersByTimeAsync(6_000);
      await vi.advanceTimersByTimeAsync(6_000);

      expect(fetchUsage).toHaveBeenCalledTimes(2);
      await run;
      expect(fetchUsage).toHaveBeenCalledTimes(2);
      expect(usageTracker.refreshNow).not.toHaveBeenCalled();
      expect(terminal.dispose).toHaveBeenCalled();
      disposables.forEach(d => d.dispose());
    });
  });

  describe("late Augment updates", () => {
    it("ends disabled when Augment is turned off while the credit update is being stored", async () => {
      const enabled = { value: true };
      const stored = deferred<void>();
      let fetcher: (() => Promise<boolean>) | undefined;
      const usageTracker = {
        getFetchSource: () => "manual",
        setRealDataFetcher: vi.fn((next: () => Promise<boolean>) => {
          fetcher = next;
        }),
        clearRealDataFlag: vi.fn(),
        notifyChanged: vi.fn(),
        updateWithRealData: vi.fn(() => stored.promise),
      };
      const storageManager = {
        isCliAuthDisabled: () => false,
        setProviderHealth: vi.fn(async () => {}),
        getProviderHealth: vi.fn(async () => null),
      };
      const auggieCliSource = {
        fetchUsage: vi.fn(async () => ({
          status: "ok",
          data: { totalUsage: 950, usageLimit: 1000 },
        })),
        getFetchGeneration: () => 0,
        isFetchGenerationCurrent: () => true,
      };
      const coordinator = new RuntimeCoordinator(
        {} as never,
        storageManager as unknown as StorageManager,
        {
          getDataSource: () => "auggie-cli",
          isAugmentEnabled: () => enabled.value,
          isEnabled: () => true,
          isProviderTrackingEnabled: () => false,
          getEnabledProviderIds: () => [],
        } as unknown as ConfigManager,
        {
          hasCookie: () => false,
          getRequestGeneration: () => 0,
          isRequestGenerationCurrent: () => true,
        } as unknown as AugmentApiClient,
        usageTracker as unknown as UsageTracker,
        { updateDisplay: vi.fn(async () => {}) } as never,
        { collectUsage: vi.fn(async () => {}) } as unknown as ProviderUsageService,
        auggieCliSource as unknown as AuggieCliSource
      );
      (coordinator as unknown as { attachRealDataFetcher(): void }).attachRealDataFetcher();

      const run = fetcher!();
      await vi.waitFor(() => expect(usageTracker.updateWithRealData).toHaveBeenCalled());
      enabled.value = false;
      stored.resolve();
      await run;

      expect(storageManager.setProviderHealth).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: "connected" })
      );
      expect(storageManager.setProviderHealth).toHaveBeenLastCalledWith(
        expect.objectContaining({ providerId: "augment", status: "disabled" })
      );
      expect(usageTracker.clearRealDataFlag).toHaveBeenCalled();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        "setContext",
        "augmeter.isSignedIn",
        true
      );
    });

    it("fires no credit alert when Augment is turned off while the update is being stored", async () => {
      const enabled = { value: true };
      const saved = deferred<void>();
      const storage = {
        getUsageData: vi.fn(async () => ({ totalUsage: 0, lastResetDate: "", dailyUsage: {} })),
        saveUsageData: vi.fn(() => saved.promise),
        resetAlertState: vi.fn(async () => {}),
        saveUsageSnapshot: vi.fn(async () => {}),
        cleanOldSnapshots: vi.fn(async () => {}),
        getUsageSnapshots: vi.fn(async () => []),
        replaceProviderUsageSnapshotsForProviders: vi.fn(async () => {}),
        setProviderHealth: vi.fn(async () => {}),
        cleanOldProviderSnapshots: vi.fn(async () => {}),
        getNotifiedThresholdForCycle: vi.fn(async () => 0),
        setNotifiedThresholdForCycle: vi.fn(async () => {}),
        isRunOutAlertedForCycle: vi.fn(async () => false),
        setRunOutAlertedForCycle: vi.fn(async () => {}),
      };
      const tracker = new UsageTracker(
        storage as unknown as StorageManager,
        {
          isAugmentEnabled: () => enabled.value,
          getHistoryRetentionDays: () => 35,
          getAlertThresholds: () => ({ warning: 75, high: 90, critical: 95 }),
          getRunOutAlertDays: () => 3,
        } as unknown as ConfigManager
      );

      const update = tracker.updateWithRealData({
        totalUsage: 960,
        usageLimit: 1000,
        sourceKind: "cli",
      });
      await vi.waitFor(() => expect(storage.saveUsageData).toHaveBeenCalled());
      enabled.value = false;
      saved.resolve();
      await update;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(storage.setNotifiedThresholdForCycle).not.toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
      tracker.dispose();
    });
  });
});
