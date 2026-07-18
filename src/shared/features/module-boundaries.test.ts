// @vitest-environment node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ReferenceKind =
  | "dynamic-import"
  | "import"
  | "import-type"
  | "re-export"
  | "require";

type ModuleReference = {
  readonly kind: ReferenceKind;
  readonly specifier: string;
};

type BoundaryViolation = ModuleReference & {
  readonly filePath: string;
  readonly reason: string;
};

const sourceExtensions = /\.(?:[cm]?[jt]sx?)$/;

const forbiddenDomainRoots = [
  "react",
  "next",
  "@supabase",
  "supabase",
  "octokit",
  "@octokit",
  "inngest",
  "ai",
  "@ai-sdk",
  "openai",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "deepseek",
  "@deepseek",
] as const;

function normalizePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

function featureNameFromPath(filePath: string) {
  const match = normalizePath(path.resolve(filePath)).match(
    /\/src\/features\/([^/]+)(?:\/|$)/,
  );

  return match?.[1];
}

function extractModuleReferences(sourceText: string, filePath: string) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const references: ModuleReference[] = [];

  const addReference = (kind: ReferenceKind, node: ts.Node | undefined) => {
    if (node && ts.isStringLiteralLike(node)) {
      references.push({ kind, specifier: node.text });
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      addReference("import", node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      addReference("re-export", node.moduleSpecifier);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      addReference("import-type", node.argument.literal);
    } else if (ts.isCallExpression(node)) {
      const [argument] = node.arguments;

      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addReference("dynamic-import", argument);
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"
      ) {
        addReference("require", argument);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

function isForbiddenDomainImport(specifier: string) {
  return forbiddenDomainRoots.some(
    (root) => specifier === root || specifier.startsWith(`${root}/`),
  );
}

function violationForReference(
  filePath: string,
  reference: ModuleReference,
): BoundaryViolation | undefined {
  const normalizedFilePath = normalizePath(path.resolve(filePath));

  if (
    normalizedFilePath.includes("/src/domain/") &&
    isForbiddenDomainImport(reference.specifier)
  ) {
    return {
      ...reference,
      filePath: normalizedFilePath,
      reason: "Domain modules must remain pure TypeScript and cannot import frameworks or external SDKs.",
    };
  }

  const currentFeature = featureNameFromPath(filePath);

  if (!currentFeature) {
    return undefined;
  }

  const aliasMatch = reference.specifier.match(
    /^@\/features\/([^/]+)(?:\/(.+))?$/,
  );

  if (aliasMatch) {
    const [, targetFeature, internalPath] = aliasMatch;

    if (internalPath) {
      return {
        ...reference,
        filePath: normalizedFilePath,
        reason:
          targetFeature === currentFeature
            ? "A Feature must import its own internals with a relative path."
            : "Feature internals are private. Import another Feature only through its public root entry.",
      };
    }

    return undefined;
  }

  if (reference.specifier.startsWith(".")) {
    const targetPath = path.resolve(path.dirname(filePath), reference.specifier);
    const targetFeature = featureNameFromPath(targetPath);

    if (targetFeature && targetFeature !== currentFeature) {
      return {
        ...reference,
        filePath: normalizedFilePath,
        reason:
          "A Feature cannot reach another Feature through a relative path. Import its public root entry instead.",
      };
    }
  }

  return undefined;
}

function scanModuleSource(filePath: string, sourceText: string) {
  return extractModuleReferences(sourceText, filePath).flatMap((reference) => {
    const violation = violationForReference(filePath, reference);
    return violation ? [violation] : [];
  });
}

function listSourceFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    return entry.isFile() && sourceExtensions.test(entry.name) ? [entryPath] : [];
  });
}

function scanCurrentSourceTree() {
  const roots = [
    path.join(process.cwd(), "src", "domain"),
    path.join(process.cwd(), "src", "features"),
  ];

  return roots
    .flatMap(listSourceFiles)
    .flatMap((filePath) =>
      scanModuleSource(filePath, readFileSync(filePath, "utf8")),
    );
}

const syntheticPath = (...segments: string[]) =>
  path.join(process.cwd(), "src", ...segments);

const allowedExamples = [
  {
    name: "Domain imports its own pure TypeScript module",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import { projectId } from "./project-id";',
  },
  {
    name: "Feature imports its own internal module relatively",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'import { value } from "./internal/value";',
  },
  {
    name: "Feature imports a shared contract",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'import type { Contract } from "@/shared/contracts";',
  },
  {
    name: "Feature imports another Feature public root",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'import { publicApi } from "@/features/beta";',
  },
  {
    name: "Feature import type reads another Feature public root",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'type PublicApi = import("@/features/beta").PublicApi;',
  },
] as const;

const rejectedExamples = [
  {
    name: "Domain static import of React",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import React from "react";',
    specifier: "react",
    kind: "import",
  },
  {
    name: "Domain static import of next/server",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import { NextResponse } from "next/server";',
    specifier: "next/server",
    kind: "import",
  },
  {
    name: "Domain static import of Supabase",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import { createClient } from "@supabase/supabase-js";',
    specifier: "@supabase/supabase-js",
    kind: "import",
  },
  {
    name: "Domain static import of Octokit",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import { Octokit } from "octokit";',
    specifier: "octokit",
    kind: "import",
  },
  {
    name: "Domain static import of Inngest",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import { Inngest } from "inngest";',
    specifier: "inngest",
    kind: "import",
  },
  {
    name: "Domain static import of OpenAI",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import OpenAI from "openai";',
    specifier: "openai",
    kind: "import",
  },
  {
    name: "Domain dynamic import of an AI SDK",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'const provider = import("@ai-sdk/openai");',
    specifier: "@ai-sdk/openai",
    kind: "dynamic-import",
  },
  {
    name: "Domain require of a framework",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'const React = require("react");',
    specifier: "react",
    kind: "require",
  },
  {
    name: "Domain import type of React",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'type ReactType = import("react").ReactType;',
    specifier: "react",
    kind: "import-type",
  },
  {
    name: "Feature alias import of another Feature internal file",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'import { secret } from "@/features/beta/internal/secret";',
    specifier: "@/features/beta/internal/secret",
    kind: "import",
  },
  {
    name: "Feature alias import type of another Feature internal file",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source:
      'type Secret = import("@/features/beta/internal/secret").Secret;',
    specifier: "@/features/beta/internal/secret",
    kind: "import-type",
  },
  {
    name: "Feature relative import of another Feature internal file",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'import { secret } from "../beta/internal/secret";',
    specifier: "../beta/internal/secret",
    kind: "import",
  },
  {
    name: "Feature relative import type of another Feature internal file",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'type Secret = import("../beta/internal/secret").Secret;',
    specifier: "../beta/internal/secret",
    kind: "import-type",
  },
  {
    name: "Feature re-export of another Feature internal file",
    filePath: syntheticPath("features", "alpha", "index.ts"),
    source: 'export { secret } from "@/features/beta/internal/secret";',
    specifier: "@/features/beta/internal/secret",
    kind: "re-export",
  },
] as const;

const eslint = new ESLint({ cwd: process.cwd() });

async function lintSynthetic(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages;
}

describe("module boundary AST scanner", () => {
  it.each(allowedExamples)("allows: $name", ({ filePath, source }) => {
    expect(scanModuleSource(filePath, source)).toEqual([]);
  });

  it.each(rejectedExamples)(
    "rejects: $name",
    ({ filePath, source, specifier, kind }) => {
      const violations = scanModuleSource(filePath, source);

      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({ specifier, kind });
      expect(violations[0]?.reason).toBeTruthy();
    },
  );

  it("finds no violations in the current source tree", () => {
    expect(scanCurrentSourceTree()).toEqual([]);
  });
});

describe("ESLint module boundary enforcement", () => {
  it.each([
    ["react", 'import React from "react";'],
    ["next/server", 'import { NextResponse } from "next/server";'],
    ["@supabase/supabase-js", 'import { createClient } from "@supabase/supabase-js";'],
    ["octokit", 'import { Octokit } from "octokit";'],
    ["inngest", 'import { Inngest } from "inngest";'],
    ["openai", 'import OpenAI from "openai";'],
  ])("rejects Domain import %s", async (_specifier, source) => {
    const messages = await lintSynthetic(
      source,
      syntheticPath("domain", "projects", "service.ts"),
    );

    expect(messages.some(({ ruleId }) => ruleId === "no-restricted-imports")).toBe(
      true,
    );
  });

  it("rejects a Feature internal alias without blocking its public root", async () => {
    const internalMessages = await lintSynthetic(
      'import { secret } from "@/features/beta/internal/secret";',
      syntheticPath("features", "alpha", "service.ts"),
    );
    const publicMessages = await lintSynthetic(
      'import { publicApi } from "@/features/beta";',
      syntheticPath("features", "alpha", "service.ts"),
    );

    expect(
      internalMessages.some(({ ruleId }) => ruleId === "no-restricted-imports"),
    ).toBe(true);
    expect(
      publicMessages.some(({ ruleId }) => ruleId === "no-restricted-imports"),
    ).toBe(false);
  });
});
