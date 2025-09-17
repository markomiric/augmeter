const Module = require("module");
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
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
      },
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
      }
      global.__augmeter_error_stub__ = AugmeterError;
    }
    return { AugmeterError: global.__augmeter_error_stub__ };
  }
  return originalLoad.apply(this, arguments);
};
