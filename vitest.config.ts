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
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "html", "lcov", "json"],
      reportsDirectory: "./coverage",
      exclude: [...coverageConfigDefaults.exclude, "docs/**", "src/test/**", "test-setup/**"],
      // Measured 2026-07-04: 53.7 lines / 69.73 branches / 60.74 functions.
      // Gates sit ~5 points below measured; raise them as coverage grows.
      thresholds: {
        lines: 48,
        functions: 57,
        branches: 64,
        statements: 48,
      },
    },
    setupFiles: ["./test-setup/vitest-setup.ts"],
  },
});
