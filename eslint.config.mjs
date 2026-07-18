import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/domain/**/*.{ts,tsx,js,jsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "react",
            "next",
            "supabase",
            "octokit",
            "inngest",
            "ai",
            "openai",
            "@anthropic-ai/sdk",
            "@google/generative-ai",
            "deepseek",
          ].map((name) => ({
            name,
            message:
              "Domain modules must remain pure TypeScript and cannot import frameworks or external SDKs.",
          })),
          patterns: [
            {
              group: [
                "react/*",
                "next/*",
                "@supabase/*",
                "@octokit/*",
                "inngest/*",
                "@ai-sdk/*",
                "@deepseek/*",
              ],
              message:
                "Domain modules must remain pure TypeScript and cannot import frameworks or external SDKs.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx,js,jsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/**"],
              message:
                "Feature internals are private. Import another feature only through its public root entry.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
