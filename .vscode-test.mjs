import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/suite/**/*.test.js",
  // Default to the oldest supported release; CI also supplies "stable".
  version: process.env.VSCODE_VERSION ?? "1.104.1",
  workspaceFolder: "./test-workspace",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});
