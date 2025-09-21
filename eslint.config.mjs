import tsParser from "@typescript-eslint/parser";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";
import globals from "globals";
import { fileURLToPath } from "url";
import { dirname } from "path";

import eslintConfigPrettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      prettier: prettierPlugin,
      "@typescript-eslint": tsEslintPlugin,
    },
    rules: {
      // Base ESLint rules
      "prefer-const": "error",
      "no-var": "error",
      "no-console": "error",
      "no-undef": "off",

      // TypeScript ESLint rules (non-type-checked)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Type-checked rules
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false, // Allow promises in void contexts (e.g., event handlers)
        },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/explicit-module-boundary-types": [
        "warn",
        {
          allowArgumentsExplicitlyTypedAsAny: true,
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      // Prettier
      "prettier/prettier": "error",
    },
  },
  {
    files: ["src/test/**/*.ts", "src/unit/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
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
