import { configDefaults, coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/unit/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "src/test/**/*"],
    coverage: {
      all: false,
      provider: "v8",
      reporter: ["text", "html", "lcov", "json"],
      reportsDirectory: "./coverage",
      exclude: [...coverageConfigDefaults.exclude, "docs/**", "src/test/**", "test-setup/**"],
      thresholds: {
        lines: 30,
        functions: 60,
        branches: 65,
        statements: 30,
      },
    },
    setupFiles: ["./test-setup/vitest-setup.ts"],
  },
});
