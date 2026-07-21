import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "dist-scorm", "node_modules", "coverage"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      /*
       * Specification section 27 forbids these outright. They are the routes by
       * which learner-supplied or LMS-supplied text could become executable.
       */
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "react-hooks/react-compiler": "off",

      /* Unused variables are an error, but an underscore prefix opts out --
         several domain rule signatures legitimately ignore a parameter. */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      /* `any` erases the type safety the domain model depends on. */
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  {
    /* Tests deliberately reach into internals to simulate tampering. */
    files: ["**/*.test.{ts,tsx}", "test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
