import tsParser from "@typescript-eslint/parser";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";
import globals from "globals";

import eslintConfigPrettier from "eslint-config-prettier";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      prettier: prettierPlugin,
      "@typescript-eslint": tsEslintPlugin,
    },
    rules: {
      "prefer-const": "error",
      "no-var": "error",
      "no-console": "error",
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "prettier/prettier": "error",
    },
  },
  {
    files: ["src/test/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/core/logging/secure-logger.ts"],
    rules: {
      "no-console": "off",
    },
  },

  eslintConfigPrettier,
  {
    ignores: [
      // Build Output & Distribution
      "out/**",
      "dist/**",
      "build/**",
      "lib/**",
      "coverage/**",
      ".nyc_output/**",

      // Dependencies
      "node_modules/**",
      "jspm_packages/**",

      // Generated Files
      "**/*.min.js",
      "**/*.bundle.js",
      "**/*.generated.js",
      "**/*.d.ts",

      // Test Coverage & Reports
      "test-results/**",
      "test-reports/**",
      "junit.xml",

      // VS Code Test Environment
      ".vscode-test/**",
      ".vscode-test-web/**",

      // Package Manager Files
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",

      // Logs & Temporary Files
      "**/*.log",
      "npm-debug.log*",
      "yarn-debug.log*",
      "yarn-error.log*",
      "**/*.tmp",
      "**/*.temp",
      "tmp/**",
      "temp/**",

      // OS Files
      ".DS_Store",
      "Thumbs.db",

      // Third-party Libraries
      "vendor/**",
      "third-party/**",

      // Legacy or Generated Code
      "legacy/**",
      "generated/**",
      "auto-generated/**",

      // Documentation
      "docs/**",

      // Cache Directories
      ".cache/**",
      ".parcel-cache/**",
      ".rpt2_cache*/**",

      // Environment Files
      ".env*",

      // VS Code Extension Package
      "*.vsix",
    ],
  },
];
