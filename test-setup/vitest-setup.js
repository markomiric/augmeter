"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Vitest setup file for mocking VS Code API and other dependencies.
 */
const vitest_1 = require("vitest");
// Simple in-memory clipboard and command registry for unit tests
const globalClipboard = { value: '' };
const globalCommands = new Map();
const globalOpenCalls = [];
// Mock VS Code API
const vscode = {
    workspace: {
        getConfiguration: vitest_1.vi.fn(() => ({
            get: vitest_1.vi.fn((key, defaultValue) => defaultValue),
        })),
    },
    window: {
        createOutputChannel: vitest_1.vi.fn(() => ({
            appendLine: vitest_1.vi.fn(),
            dispose: vitest_1.vi.fn(),
        })),
        withProgress: vitest_1.vi.fn(async (_opts, task) => {
            const progress = { report: vitest_1.vi.fn() };
            const token = { isCancellationRequested: false, onCancellationRequested: vitest_1.vi.fn() };
            return await task(progress, token);
        }),
        showInformationMessage: vitest_1.vi.fn(async (_message, ..._items) => undefined),
        showWarningMessage: vitest_1.vi.fn(async (_message, ..._items) => undefined),
        showInputBox: vitest_1.vi.fn(async (_options) => undefined),
        showQuickPick: vitest_1.vi.fn(async (_items, _options) => undefined),
        setStatusBarMessage: vitest_1.vi.fn((_text, _timeout) => { }),
    },
    commands: {
        registerCommand: vitest_1.vi.fn((id, fn) => {
            globalCommands.set(id, fn);
            return { dispose: vitest_1.vi.fn() };
        }),
        executeCommand: vitest_1.vi.fn(async (id, ...args) => {
            if (id === 'vscode.open') {
                globalOpenCalls.push(args);
                return;
            }
            const fn = globalCommands.get(id);
            if (fn)
                return await fn(...args);
        }),
    },
    env: {
        clipboard: {
            readText: vitest_1.vi.fn(async () => globalClipboard.value),
            writeText: vitest_1.vi.fn(async (text) => {
                globalClipboard.value = text || '';
            }),
        },
    },
    Uri: {
        parse: vitest_1.vi.fn((s) => ({ toString: () => String(s) })),
    },
    ProgressLocation: {
        Notification: 15,
    },
    ThemeColor: class {
    },
    CancellationTokenSource: class {
        token;
        constructor() {
            this.token = {
                isCancellationRequested: false,
                onCancellationRequested: vitest_1.vi.fn(() => ({ dispose: vitest_1.vi.fn() })),
            };
        }
        cancel() {
            this.token.isCancellationRequested = true;
        }
        dispose() { }
    },
};
// Mock vscode module
vitest_1.vi.mock('vscode', () => vscode);
// Mock SecureLogger
vitest_1.vi.mock('./src/core/logging/secure-logger', () => ({
    SecureLogger: {
        init: vitest_1.vi.fn(),
        info: vitest_1.vi.fn(),
        warn: vitest_1.vi.fn(),
        error: vitest_1.vi.fn(),
        dispose: vitest_1.vi.fn(),
    },
}));
// Mock AugmeterError
class AugmeterError extends Error {
    type;
    userMessage;
    recoverable;
    retryAction;
    constructor(type, message, userMessage, recoverable = true, retryAction) {
        super(message);
        this.name = 'AugmeterError';
        this.type = type;
        this.userMessage = userMessage;
        this.recoverable = recoverable;
        this.retryAction = retryAction;
    }
    static network(message, userMessage, retryAction) {
        return new AugmeterError('network', message, userMessage, true, retryAction);
    }
    static validation(message, userMessage) {
        return new AugmeterError('validation', message, userMessage, true);
    }
    static authentication(message, userMessage) {
        return new AugmeterError('authentication', message, userMessage, true);
    }
    static storage(message, userMessage) {
        return new AugmeterError('storage', message, userMessage, true);
    }
}
vitest_1.vi.mock('./src/core/errors/augmeter-error', () => ({
    AugmeterError,
    ErrorHandler: {
        withErrorHandling: vitest_1.vi.fn(async (fn) => await fn()),
        handleSilently: vitest_1.vi.fn(),
        handle: vitest_1.vi.fn(async () => { }),
    },
}));
//# sourceMappingURL=vitest-setup.js.map