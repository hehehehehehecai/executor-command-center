// @vitest-environment node

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const item = path.join(directory, entry);
    return statSync(item).isDirectory()
      ? sourceFiles(item)
      : /\.[cm]?[jt]sx?$/.test(entry) && !/\.test\.[cm]?[jt]sx?$/.test(entry)
        ? [item]
        : [];
  });
}

describe("beta-security-boundary.v1 static enforcement", () => {
  const files = sourceFiles(path.join(process.cwd(), "src"));

  it("routes every production console sink through the centralized redactor", () => {
    const directSinks = files.filter((file) =>
      /console\.(?:log|info|warn|error)\s*\(/.test(readFileSync(file, "utf8"))
      && !file.endsWith(path.join("shared", "security", "safe-log-redaction.ts"))
    );
    expect(directSinks).toEqual([]);
  });

  it("keeps private server variables out of every Client Component", () => {
    const violations = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /^\s*["']use client["'];/m.test(source)
        && /SUPABASE_SERVICE_ROLE_KEY|GITHUB_APP_PRIVATE_KEY|GITHUB_WEBHOOK_SECRET|INNGEST_SIGNING_KEY|DEEPSEEK_API_KEY/.test(source);
    });
    expect(violations).toEqual([]);
  });

  it("does not serialize stack, SQL, provider body or raw errors from Route files", () => {
    const routes = files.filter((file) => file.endsWith(`${path.sep}route.ts`));
    const violations = routes.filter((file) =>
      /error\.stack|JSON\.stringify\(\s*error\s*\)|provider[_ .-]?body|sql[_ .-]?error/i.test(readFileSync(file, "utf8"))
    );
    expect(violations).toEqual([]);
  });
});
