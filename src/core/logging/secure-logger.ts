import * as vscode from "vscode";

// Secure logging utility
export class SecureLogger {
  private static outputChannel: vscode.OutputChannel | null = null;

  static init(name: string = "Augmeter"): void {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel(name);
    }
  }

  private static readonly levelPriority: Record<"ERROR" | "WARN" | "INFO", number> = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
  };

  private static getConfiguredLevel(): "ERROR" | "WARN" | "INFO" {
    // Simpler, pragmatic default: always log INFO and above
    return "INFO";
  }

  private static redact(value: any): any {
    try {
      const redactString = (s: string) =>
        s
          .replace(/(_session=)([^;\s]+)/gi, "$1[REDACTED]")
          .replace(/(authorization\s*:\s*)([^\s]+)/gi, "$1[REDACTED]")
          .replace(/(cookie\s*:\s*)([^\s;][^\n]*)/gi, "$1[REDACTED]");

      const helper = (v: any, depth = 0): any => {
        if (v == null) return v;
        if (typeof v === "string") return redactString(v);
        if (typeof v !== "object") return v;
        if (depth > 2) return "[Object]"; // avoid deep recursion
        if (Array.isArray(v)) return v.map(x => helper(x, depth + 1));
        const out: Record<string, any> = {};
        for (const [k, val] of Object.entries(v)) {
          if (["cookie", "Cookie", "authorization", "Authorization"].includes(k)) {
            out[k] = "[REDACTED]";
          } else {
            out[k] = helper(val, depth + 1);
          }
        }
        return out;
      };

      return helper(value);
    } catch {
      return "[Unserializable]";
    }
  }

  static log(level: "INFO" | "WARN" | "ERROR", message: string, ...args: any[]): void {
    const configured = this.getConfiguredLevel();
    if (this.levelPriority[level] > this.levelPriority[configured]) {
      return; // below configured log level
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level}: ${message}`;
    const redactedArgs = args.map(a => this.redact(a));

    if (this.outputChannel) {
      this.outputChannel.appendLine(logMessage);
      if (redactedArgs.length > 0) {
        this.outputChannel.appendLine(`  Details: ${JSON.stringify(redactedArgs, null, 2)}`);
      }
    }

    // Also log to console for development
    switch (level) {
      case "INFO":
        console.log(logMessage, ...redactedArgs);
        break;
      case "WARN":
        console.warn(logMessage, ...redactedArgs);
        break;
      case "ERROR":
        console.error(logMessage, ...redactedArgs);
        break;
    }
  }

  static info(message: string, ...args: any[]): void {
    this.log("INFO", message, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    this.log("WARN", message, ...args);
  }

  static error(message: string, ...args: any[]): void {
    this.log("ERROR", message, ...args);
  }

  static dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
      this.outputChannel = null;
    }
  }
}
