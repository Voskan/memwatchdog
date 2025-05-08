// eslint.config.mjs  – ESLint 9 Flat Config

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  /* ───────── 0. Глобальный ignore ─────────────────────────────── */
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "native/**",
      "*.d.ts",
      "*.bench.ts",
    ],
  },

  /* ───────── 1. Плагин @typescript-eslint (декларация) ────────── */
  { plugins: { "@typescript-eslint": tseslint.plugin } },

  /* ───────── 2. TypeScript файлы ──────────────────────────────── */
  ...tseslint.config({
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parserOptions: { project: ["./tsconfig.base.json"] } },
    settings: {
      "import/resolver": { typescript: { project: "./tsconfig.base.json" } },
    },
    plugins: { import: importPlugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          "newlines-between": "always",
        },
      ],
      "import/namespace": "off",
    },
  }),

  /* ───────── 3. Airbnb-base для JS/JSX via compat ─────────────── */
  ...compat.config({
    extends: ["airbnb-base", "plugin:import/recommended", "prettier"],
    // settings можно оставлять — они разрешены в .eslintrc
    settings: {
      "import/resolver": { typescript: { project: "./tsconfig.base.json" } },
    },
  }),

  /* ───────── 4. Ограничиваем Airbnb только на JS/JSX ──────────── */
  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {
      "import/namespace": "off", // тот же recursion-баг, но только JS
    },
  },

  /* ───────── 5. Prettier off-switch (дублируем для надёжности) ── */
  prettier,
];
