/**
 * Vitest setup file for mocking VS Code API and other dependencies.
 */
import { vi } from "vitest";

// Windows ICU ignores LANG and assertions use en-US literals, so default the locale to en-US.
function pinDefaultLocale<T extends object>(
  proto: T,
  method: "toLocaleString" | "toLocaleDateString" | "toLocaleTimeString"
): void {
  const target = proto as Record<string, unknown>;
  const original = target[method] as (
    this: unknown,
    locales?: Intl.LocalesArgument,
    options?: object
  ) => string;
  target[method] = function (this: unknown, locales?: Intl.LocalesArgument, options?: object) {
    return original.call(this, locales === undefined ? "en-US" : locales, options);
  };
}
pinDefaultLocale(Number.prototype, "toLocaleString");
pinDefaultLocale(Date.prototype, "toLocaleString");
pinDefaultLocale(Date.prototype, "toLocaleDateString");
pinDefaultLocale(Date.prototype, "toLocaleTimeString");

// Simple in-memory clipboard and command registry for unit tests
const globalClipboard = { value: "" };
const globalCommands = new Map<string, (...args: any[]) => any>();
const globalOpenCalls: any[] = [];

// Mock VS Code API
const vscode = {
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: any) => defaultValue),
    })),
    onDidChangeConfiguration: vi.fn((_listener: (event: unknown) => void) => ({
      dispose: vi.fn(),
    })),
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
    withProgress: vi.fn(async (_opts: any, task: any) => {
      const progress = { report: vi.fn() };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
      return await task(progress, token);
    }),
    showInformationMessage: vi.fn(async (_message: string, ..._items: any[]) => undefined),
    showWarningMessage: vi.fn(async (_message: string, ..._items: any[]) => undefined),
    showInputBox: vi.fn(async (_options?: any) => undefined),
    showQuickPick: vi.fn(async (_items: any, _options?: any) => undefined),
    setStatusBarMessage: vi.fn((_text: string, _timeout?: number) => {}),
  },
  commands: {
    registerCommand: vi.fn((id: string, fn: (...args: any[]) => any) => {
      globalCommands.set(id, fn);
      return { dispose: vi.fn() };
    }),
    executeCommand: vi.fn(async (id: string, ...args: any[]) => {
      if (id === "vscode.open") {
        globalOpenCalls.push(args);
        return;
      }
      const fn = globalCommands.get(id);
      if (fn) return await fn(...args);
    }),
  },
  env: {
    clipboard: {
      readText: vi.fn(async () => globalClipboard.value),
      writeText: vi.fn(async (text: string) => {
        globalClipboard.value = text || "";
      }),
    },
  },
  Uri: {
    parse: vi.fn((s: string) => ({ toString: () => String(s) })),
  },
  ProgressLocation: {
    Notification: 15,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  ThemeColor: class {},
  EventEmitter: class<T> {
    private listeners: Array<(e: T) => void> = [];
    event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(data: T) {
      for (const listener of this.listeners) listener(data);
    }
    dispose() {
      this.listeners = [];
    }
  },
  CancellationTokenSource: class {
    token: any;
    constructor() {
      this.token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
      };
    }
    cancel() {
      this.token.isCancellationRequested = true;
    }
    dispose() {}
  },
};

// Mock vscode module
vi.mock("vscode", () => vscode);

// Mock SecureLogger
vi.mock("./src/core/logging/secure-logger", () => ({
  SecureLogger: {
    init: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dispose: vi.fn(),
  },
}));

// Mock AugmeterError
class AugmeterError extends Error {
  type: string;
  userMessage: string;
  recoverable: boolean;
  retryAction?: () => void;

  constructor(
    type: string,
    message: string,
    userMessage: string,
    recoverable: boolean = true,
    retryAction?: () => void
  ) {
    super(message);
    this.name = "AugmeterError";
    this.type = type;
    this.userMessage = userMessage;
    this.recoverable = recoverable;
    this.retryAction = retryAction;
  }

  static network(message: string, userMessage: string, retryAction?: () => void) {
    return new AugmeterError("network", message, userMessage, true, retryAction);
  }

  static validation(message: string, userMessage: string) {
    return new AugmeterError("validation", message, userMessage, true);
  }

  static authentication(message: string, userMessage: string) {
    return new AugmeterError("authentication", message, userMessage, true);
  }

  static storage(message: string, userMessage: string) {
    return new AugmeterError("storage", message, userMessage, true);
  }
}

vi.mock("./src/core/errors/augmeter-error", () => ({
  AugmeterError,
  ErrorHandler: {
    withErrorHandling: vi.fn(async (fn: () => any) => await fn()),
    handleSilently: vi.fn(),
    handle: vi.fn(async () => {}),
  },
}));
