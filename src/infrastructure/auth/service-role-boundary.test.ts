// @vitest-environment node

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const factoryPath = path.join(
  projectRoot,
  "src",
  "infrastructure",
  "auth",
  "service-role-user-repository.ts",
);

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    return statSync(entryPath).isDirectory()
      ? listSourceFiles(entryPath)
      : /\.[cm]?[jt]sx?$/.test(entry)
        ? [entryPath]
        : [];
  });
}

describe("service-role identity boundary", () => {
  it("marks the credential-owning factory as server-only", () => {
    expect(readFileSync(factoryPath, "utf8")).toMatch(
      /^import ["']server-only["'];/,
    );
  });

  it("does not expose a NEXT_PUBLIC service-role variable", () => {
    const source = listSourceFiles(path.join(projectRoot, "src"))
      .filter((filePath) => !/\.test\.[cm]?[jt]sx?$/.test(filePath))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps the service-role factory out of Client Component imports", () => {
    const clientComponents = listSourceFiles(path.join(projectRoot, "src")).filter(
      (filePath) =>
        /^\s*["']use client["'];/m.test(readFileSync(filePath, "utf8")),
    );

    for (const filePath of clientComponents) {
      expect(readFileSync(filePath, "utf8")).not.toMatch(
        /infrastructure\/auth\/service-role-user-repository/,
      );
    }
  });
});
