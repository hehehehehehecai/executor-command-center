// @vitest-environment node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ReferenceKind =
  | "dynamic-import"
  | "import"
  | "import-equals"
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
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addReference("import-equals", node.moduleReference.expression);
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

function isPanelQueryContractPath(filePath: string) {
  return normalizePath(path.resolve(filePath)).includes(
    "/src/shared/panel-query/",
  );
}

function isConnectedPanelHarnessPath(filePath: string) {
  const normalizedPath = normalizePath(path.resolve(filePath));
  return (
    normalizedPath.includes("/src/testing/connected-panels/") &&
    !normalizedPath.endsWith(".test.ts") &&
    !normalizedPath.endsWith(".test.tsx")
  );
}

const providerNeutralFeatures = new Set([
  "copilot",
  "decision-archive",
  "flight-log",
  "mission-control",
  "project-galaxy",
]);

function isProviderNeutralFeaturePath(filePath: string) {
  const featureName = featureNameFromPath(filePath);
  return featureName !== undefined && providerNeutralFeatures.has(featureName);
}

function isForbiddenProviderNeutralFeatureImport(specifier: string) {
  const forbiddenProviderRoots = [
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
  ];

  return (
    forbiddenProviderRoots.some(
      (root) => specifier === root || specifier.startsWith(`${root}/`),
    ) ||
    specifier === "server-only" ||
    specifier.startsWith("@/content/demo-data/") ||
    specifier.startsWith("@/infrastructure/")
  );
}

function isForbiddenPanelQueryImport(specifier: string) {
  return (
    isForbiddenDomainImport(specifier) ||
    specifier === "server-only" ||
    specifier.startsWith("node:") ||
    specifier.startsWith("@/application/") ||
    specifier.startsWith("@/content/demo-data/") ||
    specifier.startsWith("@/features/") ||
    specifier.startsWith("@/infrastructure/") ||
    specifier === "@/shared/configuration/server-environment"
  );
}

function isForbiddenConnectedPanelHarnessImport(specifier: string) {
  if (specifier.startsWith(".")) return false;
  if (specifier === "next/headers") return false;

  return !/^@\/features\/(?:copilot|decision-archive|flight-log|mission-control|project-galaxy)$/.test(
    specifier,
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

  if (
    isPanelQueryContractPath(filePath) &&
    isForbiddenPanelQueryImport(reference.specifier)
  ) {
    return {
      ...reference,
      filePath: normalizedFilePath,
      reason:
        "Panel query contracts must remain provider-neutral pure TypeScript modules.",
    };
  }

  if (
    isConnectedPanelHarnessPath(filePath) &&
    isForbiddenConnectedPanelHarnessImport(reference.specifier)
  ) {
    return {
      ...reference,
      filePath: normalizedFilePath,
      reason:
        "Connected panel test harness modules may depend only on local helpers, Next cookie access, and Feature public roots.",
    };
  }

  if (
    isProviderNeutralFeaturePath(filePath) &&
    isForbiddenProviderNeutralFeatureImport(reference.specifier)
  ) {
    return {
      ...reference,
      filePath: normalizedFilePath,
      reason:
        "Provider-neutral Features must receive Preview and Connected data through injected loaders and ports.",
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
    path.join(process.cwd(), "src", "shared", "panel-query"),
    path.join(process.cwd(), "src", "testing", "connected-panels"),
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
    name: "Connected panel harness imports a Feature public root",
    filePath: syntheticPath("testing", "connected-panels", "fixture.ts"),
    source: 'import type { FlightLogSource } from "@/features/flight-log";',
  },
  {
    name: "Panel query contract imports only its local pure TypeScript module",
    filePath: syntheticPath("shared", "panel-query", "index.ts"),
    source: 'export type { PanelQuery } from "./panel-query";',
  },
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
  {
    name: "Domain import equals reads its own pure TypeScript module",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import ProjectId = require("./project-id");',
  },
  {
    name: "Feature import equals reads its own internal module relatively",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'import Local = require("./internal/local");',
  },
  {
    name: "Feature import equals reads another Feature public root",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'import PublicApi = require("@/features/beta");',
  },
  {
    name: "TypeScript internal import alias has no module specifier",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: "import Alias = Namespace.Member;",
  },
] as const;

const rejectedExamples = [
  {
    name: "Connected panel harness imports a Feature internal file",
    filePath: syntheticPath("testing", "connected-panels", "fixture.ts"),
    source: 'import type { Secret } from "@/features/flight-log/internal/secret";',
    specifier: "@/features/flight-log/internal/secret",
    kind: "import",
  },
  {
    name: "Connected panel harness imports infrastructure",
    filePath: syntheticPath("testing", "connected-panels", "fixture.ts"),
    source: 'import { client } from "@/infrastructure/supabase/client";',
    specifier: "@/infrastructure/supabase/client",
    kind: "import",
  },
  {
    name: "Copilot imports its Preview fixture directly",
    filePath: syntheticPath("features", "copilot", "query.ts"),
    source:
      'import { fixture } from "@/content/demo-data/copilot-workspace-preview-fixture";',
    specifier: "@/content/demo-data/copilot-workspace-preview-fixture",
    kind: "import",
  },
  {
    name: "Copilot imports infrastructure directly",
    filePath: syntheticPath("features", "copilot", "query.ts"),
    source: 'import { client } from "@/infrastructure/ai/client";',
    specifier: "@/infrastructure/ai/client",
    kind: "import",
  },
  {
    name: "Copilot imports an AI provider SDK directly",
    filePath: syntheticPath("features", "copilot", "query.ts"),
    source: 'import OpenAI from "openai";',
    specifier: "openai",
    kind: "import",
  },
  {
    name: "Copilot imports server-only directly",
    filePath: syntheticPath("features", "copilot", "query.ts"),
    source: 'import "server-only";',
    specifier: "server-only",
    kind: "import",
  },
  {
    name: "Decision Archive imports its Preview fixture directly",
    filePath: syntheticPath("features", "decision-archive", "query.ts"),
    source:
      'import { fixture } from "@/content/demo-data/decision-archive-preview-fixture";',
    specifier: "@/content/demo-data/decision-archive-preview-fixture",
    kind: "import",
  },
  {
    name: "Decision Archive imports infrastructure directly",
    filePath: syntheticPath("features", "decision-archive", "query.ts"),
    source: 'import { client } from "@/infrastructure/database/client";',
    specifier: "@/infrastructure/database/client",
    kind: "import",
  },
  {
    name: "Decision Archive imports an AI provider SDK directly",
    filePath: syntheticPath("features", "decision-archive", "query.ts"),
    source: 'import OpenAI from "openai";',
    specifier: "openai",
    kind: "import",
  },
  {
    name: "Decision Archive imports server-only directly",
    filePath: syntheticPath("features", "decision-archive", "query.ts"),
    source: 'import "server-only";',
    specifier: "server-only",
    kind: "import",
  },
  {
    name: "Mission Control imports its Preview fixture directly",
    filePath: syntheticPath("features", "mission-control", "query.ts"),
    source:
      'import { fixture } from "@/content/demo-data/mission-control-preview-fixture";',
    specifier: "@/content/demo-data/mission-control-preview-fixture",
    kind: "import",
  },
  {
    name: "Mission Control imports infrastructure directly",
    filePath: syntheticPath("features", "mission-control", "query.ts"),
    source: 'import { client } from "@/infrastructure/github/client";',
    specifier: "@/infrastructure/github/client",
    kind: "import",
  },
  {
    name: "Mission Control imports a GitHub provider SDK directly",
    filePath: syntheticPath("features", "mission-control", "query.ts"),
    source: 'import { Octokit } from "octokit";',
    specifier: "octokit",
    kind: "import",
  },
  {
    name: "Mission Control imports server-only directly",
    filePath: syntheticPath("features", "mission-control", "query.ts"),
    source: 'import "server-only";',
    specifier: "server-only",
    kind: "import",
  },
  {
    name: "Flight Log imports its Preview fixture directly",
    filePath: syntheticPath("features", "flight-log", "query.ts"),
    source:
      'import { fixture } from "@/content/demo-data/flight-log-preview-fixture";',
    specifier: "@/content/demo-data/flight-log-preview-fixture",
    kind: "import",
  },
  {
    name: "Flight Log imports infrastructure directly",
    filePath: syntheticPath("features", "flight-log", "query.ts"),
    source: 'import { client } from "@/infrastructure/github/client";',
    specifier: "@/infrastructure/github/client",
    kind: "import",
  },
  {
    name: "Flight Log imports a provider SDK directly",
    filePath: syntheticPath("features", "flight-log", "query.ts"),
    source: 'import { Octokit } from "octokit";',
    specifier: "octokit",
    kind: "import",
  },
  {
    name: "Flight Log imports server-only directly",
    filePath: syntheticPath("features", "flight-log", "query.ts"),
    source: 'import "server-only";',
    specifier: "server-only",
    kind: "import",
  },
  {
    name: "Project Galaxy imports its Preview fixture directly",
    filePath: syntheticPath("features", "project-galaxy", "query.ts"),
    source:
      'import { fixture } from "@/content/demo-data/project-galaxy-preview-fixture";',
    specifier: "@/content/demo-data/project-galaxy-preview-fixture",
    kind: "import",
  },
  {
    name: "Project Galaxy imports infrastructure directly",
    filePath: syntheticPath("features", "project-galaxy", "query.ts"),
    source: 'import { client } from "@/infrastructure/supabase/client";',
    specifier: "@/infrastructure/supabase/client",
    kind: "import",
  },
  {
    name: "Project Galaxy imports a provider SDK directly",
    filePath: syntheticPath("features", "project-galaxy", "query.ts"),
    source: 'import { createClient } from "@supabase/supabase-js";',
    specifier: "@supabase/supabase-js",
    kind: "import",
  },
  {
    name: "Project Galaxy imports server-only directly",
    filePath: syntheticPath("features", "project-galaxy", "query.ts"),
    source: 'import "server-only";',
    specifier: "server-only",
    kind: "import",
  },
  {
    name: "Panel query contract imports a Supabase SDK",
    filePath: syntheticPath("shared", "panel-query", "adapter.ts"),
    source: 'import { createClient } from "@supabase/supabase-js";',
    specifier: "@supabase/supabase-js",
    kind: "import",
  },
  {
    name: "Panel query contract imports a Feature internal module",
    filePath: syntheticPath("shared", "panel-query", "adapter.ts"),
    source:
      'import { internalValue } from "@/features/project-galaxy/internal/value";',
    specifier: "@/features/project-galaxy/internal/value",
    kind: "import",
  },
  {
    name: "Panel query contract imports a Demo fixture",
    filePath: syntheticPath("shared", "panel-query", "adapter.ts"),
    source:
      'import { fixture } from "@/content/demo-data/panel-fixture";',
    specifier: "@/content/demo-data/panel-fixture",
    kind: "import",
  },
  {
    name: "Panel query contract imports server-only infrastructure",
    filePath: syntheticPath("shared", "panel-query", "adapter.ts"),
    source: 'import "server-only";',
    specifier: "server-only",
    kind: "import",
  },
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
    name: "Domain import equals of React",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'import React = require("react");',
    specifier: "react",
    kind: "import-equals",
  },
  {
    name: "Domain export import equals of next/server",
    filePath: syntheticPath("domain", "projects", "service.ts"),
    source: 'export import NextServer = require("next/server");',
    specifier: "next/server",
    kind: "import-equals",
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
    name: "Feature import equals alias of another Feature internal file",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source:
      'import Secret = require("@/features/beta/internal/secret");',
    specifier: "@/features/beta/internal/secret",
    kind: "import-equals",
  },
  {
    name: "Feature import equals alias of its own internal file",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source:
      'import Local = require("@/features/alpha/internal/local");',
    specifier: "@/features/alpha/internal/local",
    kind: "import-equals",
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
    name: "Feature import equals relative path to another Feature internal file",
    filePath: syntheticPath("features", "alpha", "service.ts"),
    source: 'import Secret = require("../beta/internal/secret");',
    specifier: "../beta/internal/secret",
    kind: "import-equals",
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
  ])(
    "rejects Domain import %s",
    async (_specifier, source) => {
      const messages = await lintSynthetic(
        source,
        syntheticPath("domain", "projects", "service.ts"),
      );

      expect(
        messages.some(({ ruleId }) => ruleId === "no-restricted-imports"),
      ).toBe(true);
    },
    10_000,
  );

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
