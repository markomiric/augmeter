import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/unit/**/*.test.ts"],
    exclude: ["src/test/**/*", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/test/**", "src/unit/**", "**/*.test.ts", "**/*.d.ts", "test-setup/**"],
      thresholds: {
        lines: 30,
        functions: 63,
        branches: 75,
        statements: 30,
      },
    },
    setupFiles: ["./test-setup/vitest-setup.ts"],
  },
});
