"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
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
                lines: 27,
                functions: 59,
                branches: 66,
                statements: 27,
            },
        },
        setupFiles: ["./test-setup/vitest-setup.ts"],
    },
});
//# sourceMappingURL=vitest.config.js.map