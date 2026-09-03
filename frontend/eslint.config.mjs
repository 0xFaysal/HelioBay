import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-api/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Playwright traces contain bundled third-party JavaScript.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
