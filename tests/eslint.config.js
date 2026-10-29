// lint for the site and for the tests. it catches what a browser would only
// throw when a function first runs: a name used without being imported, an
// import nobody uses, an assignment to an imported binding.
//
// run from the repo root, through npm run lint in tests/, so both src and
// tests are inside the base path.

import globals from "globals";

const rules = {
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
  "no-redeclare": "error",
  "no-import-assign": "error",
  "no-unreachable": "error",
  "no-dupe-keys": "error",
  "no-self-assign": "error",
  "no-const-assign": "error",
};

export default [
  {
    ignores: ["tests/node_modules/**", "tests/test-results/**", "tests/playwright-report/**"],
  },
  {
    // the site: es modules in the browser, supabase-js on window
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules,
  },
  {
    // the stand-in for supabase runs inside the page, before the site does
    files: ["tests/fake/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: { ...globals.browser },
    },
    rules,
  },
  {
    // the database tests run in node
    files: ["tests/*.js", "tests/db/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules,
  },
  {
    // playwright specs run in node, and hand callbacks to page.evaluate that
    // run in the page, so both sets of names are real
    files: ["tests/e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules,
  },
];
