const Module = require("module");
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
    // Simple in-memory clipboard and command registry for unit tests
    if (!global.__vscode_clipboard__) global.__vscode_clipboard__ = "";
    if (!global.__vscode_commands__) global.__vscode_commands__ = new Map();
    if (!global.__vscode_open_calls__) global.__vscode_open_calls__ = [];

    return {
      workspace: {
        getConfiguration: () => ({
          get: (_key, defaultValue) => defaultValue,
        }),
      },
      window: {
        createOutputChannel: () => ({
          appendLine() {},
          dispose() {},
        }),
        withProgress: async (_opts, task) => {
          // Provide minimal progress + token shape
          const progress = { report: () => {} };
          const token = { isCancellationRequested: false, onCancellationRequested: () => {} };
          return await task(progress, token);
        },
        showInformationMessage: async (_message, ..._items) => {
          return undefined; // default no-op
        },
        showWarningMessage: async (_message, ..._items) => {
          return undefined;
        },
        setStatusBarMessage: (_text, _timeout) => {
          /* noop */
        },
      },
      commands: {
        registerCommand: (id, fn) => {
          global.__vscode_commands__.set(id, fn);
          return { dispose() {} };
        },
        executeCommand: async (id, ...args) => {
          if (id === "vscode.open") {
            global.__vscode_open_calls__.push(args);
            return;
          }
          const fn = global.__vscode_commands__.get(id);
          if (fn) return await fn(...args);
        },
      },
      env: {
        clipboard: {
          readText: async () => global.__vscode_clipboard__,
          writeText: async t => {
            global.__vscode_clipboard__ = t || "";
          },
        },
      },
      Uri: {
        parse: s => ({ toString: () => String(s) }),
      },
      ProgressLocation: {
        Notification: 15,
      },
      ThemeColor: class {},
    };
  }
  if (
    request.endsWith("core/logging/secure-logger") ||
    request.endsWith("core/logging/secure-logger.js") ||
    request.endsWith("logging/secure-logger")
  ) {
    return {
      SecureLogger: {
        info() {},
        warn() {},
        error() {},
      },
    };
  }
  if (
    request.endsWith("core/errors/augmeter-error") ||
    request.endsWith("core/errors/augmeter-error.js") ||
    request.endsWith("errors/augmeter-error")
  ) {
    if (!global.__augmeter_error_stub__) {
      class AugmeterError extends Error {
        constructor(type, message, userMessage, recoverable = true, retryAction) {
          super(message);
          this.name = "AugmeterError";
          this.type = type;
          this.userMessage = userMessage;
          this.recoverable = recoverable;
          this.retryAction = retryAction;
        }
        static network(message, userMessage, retryAction) {
          return new AugmeterError("network", message, userMessage, true, retryAction);
        }
        static validation(message, userMessage) {
          return new AugmeterError("validation", message, userMessage, true);
        }
        static authentication(message, userMessage) {
          return new AugmeterError("authentication", message, userMessage, true);
        }
      }
      global.__augmeter_error_stub__ = AugmeterError;
    }
    return {
      AugmeterError: global.__augmeter_error_stub__,
      ErrorHandler: {
        withErrorHandling: async (fn /*, _label*/) => await fn(),
        handleSilently: (_err, _ctx) => {},
        handle: async () => {},
      },
    };
  }
  if (
    request.includes("error-handler") ||
    request.endsWith("core/errors/error-handler") ||
    request.endsWith("core/errors/error-handler.js") ||
    request.endsWith("errors/error-handler")
  ) {
    return {
      ErrorHandler: {
        withErrorHandling: async (fn /*, _label*/) => await fn(),
        handleSilently: (_err, _ctx) => {},
        handle: async () => {},
      },
    };
  }
  return originalLoad.apply(this, arguments);
};
