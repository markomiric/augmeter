import { configDefaults, coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/unit/**/*.unit.test.ts"],
    exclude: [...configDefaults.exclude, "src/test/**/*"],
    coverage: {
      // Count the whole src tree, not just files imported by tests.
      all: true,
      provider: "v8",
      reporter: ["text", "html", "lcov", "json"],
      reportsDirectory: "./coverage",
      exclude: [...coverageConfigDefaults.exclude, "docs/**", "src/test/**", "test-setup/**"],
      // Measured 2026-06-12: 51.7 lines / 67.5 branches / 62.3 functions.
      // Gates sit ~5 points below measured; raise them as coverage grows.
      thresholds: {
        lines: 45,
        functions: 57,
        branches: 62,
        statements: 45,
      },
    },
    setupFiles: ["./test-setup/vitest-setup.ts"],
  },
});
