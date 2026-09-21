// @vitest-environment node

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ReferenceKind =
  | "css-import"
  | "css-url"
  | "dynamic-import"
  | "import"
  | "import-equals"
  | "import-type"
  | "re-export"
  | "require"
  | "resource";

type ModuleReference = {
  readonly kind: ReferenceKind;
  readonly specifier: string;
  readonly line?: number;
  readonly column?: number;
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

function scriptKindForFile(filePath: string) {
  if (/\.tsx$/i.test(filePath)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(filePath)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(filePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function extractModuleReferences(sourceText: string, filePath: string) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  );
  const references: ModuleReference[] = [];

  const addReference = (kind: ReferenceKind, node: ts.Node | undefined) => {
    if (node && ts.isStringLiteralLike(node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      references.push({ kind, specifier: node.text, line: position.line + 1, column: position.character + 1 });
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

function isProductionResourceSource(filePath: string) {
  const relative = normalizePath(path.relative(process.cwd(), filePath));
  return !/(?:\.(?:test|spec)\.[^/]+$|^src\/(?:test|testing)\/|\/(?:__tests__|__fixtures__)\/)/.test(relative);
}

function decodePathText(value: string) {
  let decoded = value;
  for (let round = 0; round < 2; round++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return normalizePath(decoded);
}

function resolveModuleTarget(filePath: string, specifier: string) {
  const normalized = decodePathText(specifier).split(/[?#]/, 1)[0];
  if (normalized.startsWith("@/")) return path.resolve(process.cwd(), "src", normalized.slice(2));
  if (normalized.startsWith(".")) return path.resolve(path.dirname(filePath), normalized);
  if (path.isAbsolute(normalized)) return path.resolve(normalized);
  return undefined;
}

function isTemporaryAttachment(reference: ModuleReference) {
  const value = decodePathText(reference.specifier).toLowerCase();
  const temporary = /(?:^|\/)(?:tmp|temp)(?:\/|$)|%temp%|%tmp%|\$\{(?:temp|tmp|tmpdir)\}/.test(value);
  const imageImport = /\.(?:png|jpe?g|webp|avif|gif|svg|bmp|ico)(?:[?#].*)?$/.test(value);
  return temporary && (imageImport || reference.kind === "resource" || reference.kind === "css-url");
}

type CssToken = { readonly kind: "string" | "word" | "punctuation"; readonly text: string; readonly start: number };

function decodeCssText(value: string) {
  return value.replace(/\\([a-f\d]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\r\n])/gi, (_match, hex: string | undefined, character: string | undefined) => {
    if (!hex) return character ?? "";
    const code = Number.parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
  });
}

function cssTokens(source: string) {
  const tokens: CssToken[] = [];
  let cursor = 0;
  const escapeLength = () => source.slice(cursor).match(/^\\(?:[a-f\d]{1,6}(?:\r\n|[\t\n\f\r ])?|[^\r\n])/i)?.[0].length ?? 1;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) { cursor++; continue; }
    if (source.startsWith("/*", cursor)) {
      const end = source.indexOf("*/", cursor + 2);
      cursor = end < 0 ? source.length : end + 2;
      continue;
    }
    const start = cursor;
    const quote = source[cursor];
    if (quote === '"' || quote === "'") {
      cursor++;
      const contentStart = cursor;
      while (cursor < source.length && source[cursor] !== quote) cursor += source[cursor] === "\\" ? escapeLength() : 1;
      tokens.push({ kind: "string", text: decodeCssText(source.slice(contentStart, cursor)), start });
      if (cursor < source.length) cursor++;
    } else if (/[{}();:,]/.test(source[cursor])) {
      tokens.push({ kind: "punctuation", text: source[cursor++], start });
    } else {
      while (cursor < source.length && !/[\s{}();:,"']/.test(source[cursor]) && !source.startsWith("/*", cursor)) cursor += source[cursor] === "\\" ? escapeLength() : 1;
      tokens.push({ kind: "word", text: decodeCssText(source.slice(start, cursor)), start });
    }
  }
  return tokens;
}

function extractCssReferences(source: string): ModuleReference[] {
  const tokens = cssTokens(source);
  const references: ModuleReference[] = [];
  const add = (kind: ReferenceKind, specifier: string, start: number) => {
    const before = source.slice(0, start).split("\n");
    references.push({ kind, specifier, line: before.length, column: before.at(-1)!.length + 1 });
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind !== "word") continue;
    if (token.text.toLowerCase() === "@import" && tokens[index + 1]?.kind === "string") {
      add("css-import", tokens[index + 1].text, tokens[index + 1].start);
    } else if (token.text.toLowerCase() === "url" && tokens[index + 1]?.text === "(") {
      const end = tokens.findIndex((candidate, at) => at > index + 1 && candidate.text === ")");
      if (end < 0) continue;
      const content = tokens.slice(index + 2, end).map((candidate) => candidate.text).join("");
      if (content) add(tokens[index - 1]?.text.toLowerCase() === "@import" ? "css-import" : "css-url", content, tokens[index + 2]?.start ?? token.start);
    }
  }
  return references;
}

function staticText(node: ts.Node | undefined, seen = new Set<ts.Node>()): string | undefined {
  if (!node || seen.has(node)) return undefined;
  const visited = new Set(seen).add(node);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) return staticText(node.expression, visited);
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => (staticText(span.expression, visited) ?? "${dynamic}") + span.literal.text).join("");
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticText(node.left, visited);
    const right = staticText(node.right, visited);
    return left !== undefined && right !== undefined ? left + right : undefined;
  }
  if (ts.isIdentifier(node)) {
    for (let scope: ts.Node | undefined = node.parent; scope; scope = scope.parent) {
      if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
        for (const statement of scope.statements) {
          if (!ts.isVariableStatement(statement)) continue;
          const declaration = statement.declarationList.declarations.find((candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === node.text);
          if (declaration) return statement.declarationList.flags & ts.NodeFlags.Const ? staticText(declaration.initializer, visited) : undefined;
        }
      }
      if ((ts.isFunctionDeclaration(scope) || ts.isFunctionExpression(scope) || ts.isArrowFunction(scope) || ts.isMethodDeclaration(scope)) && scope.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === node.text)) return undefined;
    }
  }
  return undefined;
}

function extractResourceReferences(source: string, filePath: string) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKindForFile(filePath));
  const references: ModuleReference[] = [];
  const resourceNames = new Set(["src", "srcset", "poster", "href", "xlink:href"]);
  const styleNames = new Set(["style", "background", "backgroundimage", "mask", "maskimage", "liststyleimage", "borderimage", "borderimagesource"]);
  const addValue = (name: string, node: ts.Node | undefined) => {
    const key = name.toLowerCase().replaceAll("-", "");
    const text = staticText(node);
    if (text === undefined || !node) return;
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const add = (specifier: string) => references.push({ kind: "resource", specifier, line: position.line + 1, column: position.character + 1 });
    if (key === "srcset") text.split(",").forEach((candidate) => add(candidate.trim().split(/\s+/, 1)[0]));
    else if (resourceNames.has(key)) add(text);
    else if (styleNames.has(key)) extractCssReferences(text).forEach((reference) => add(reference.specifier));
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node)) {
      addValue(node.name.getText(sourceFile), node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer);
    } else if (ts.isPropertyAssignment(node)) {
      if (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) addValue(node.name.text, node.initializer);
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)) {
      addValue(node.left.name.text, node.right);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL") {
      addValue("src", node.arguments?.[0]);
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ["setAttribute", "setProperty"].includes(node.expression.name.text)) {
      const key = staticText(node.arguments[0]);
      if (key) addValue(key, node.arguments[1]);
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

  if (isProductionResourceSource(filePath) && isTemporaryAttachment(reference)) {
    return { ...reference, filePath: normalizedFilePath, reason: "Production resources cannot reference temporary attachment paths." };
  }

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

  const targetPath = resolveModuleTarget(filePath, reference.specifier);
  const targetFeature = targetPath ? featureNameFromPath(targetPath) : undefined;
  if (normalizedFilePath.includes("/src/shared/") && targetFeature) {
    return { ...reference, filePath: normalizedFilePath, reason: "Shared modules cannot depend on Feature modules." };
  }

  const currentFeature = featureNameFromPath(filePath);

  if (!currentFeature) {
    return undefined;
  }

  const normalizedSpecifier = decodePathText(reference.specifier);
  const canonicalAlias = normalizedSpecifier.startsWith("@/") && targetPath
    ? "@/" + normalizePath(path.relative(path.join(process.cwd(), "src"), targetPath))
    : normalizedSpecifier;
  const aliasMatch = canonicalAlias.match(
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

    if (!/\.(?:css|scss|sass|less|styl|svg|png|jpe?g|webp|avif|gif|woff2?|ttf)(?:[?#].*)?$/i.test(normalizedSpecifier)) return undefined;
  }

  if (normalizedSpecifier.startsWith(".")) {
    if (targetFeature && targetFeature !== currentFeature) {
      return {
        ...reference,
        filePath: normalizedFilePath,
        reason:
          "A Feature cannot reach another Feature through a relative path. Import its public root entry instead.",
      };
    }
  }

  const visualModule = !["resource", "css-url"].includes(reference.kind) && /\.(?:css|scss|sass|less|styl|svg|png|jpe?g|webp|avif|gif|woff2?|ttf)(?:[?#].*)?$/i.test(normalizedSpecifier);
  if (visualModule) {
    const normalizedTarget = targetPath ? normalizePath(targetPath) : "";
    const fromSharedVisual = normalizedTarget.startsWith(normalizePath(path.join(process.cwd(), "src/shared/visual-system")) + "/");
    const ownCssModule = targetFeature === currentFeature && /\.module\.css$/.test(normalizedTarget);
    if (!fromSharedVisual && !ownCssModule) return { ...reference, filePath: normalizedFilePath, reason: "Visual files must come from shared/visual-system or the Feature's own CSS Module." };
  }

  return undefined;
}

function scanModuleSource(filePath: string, sourceText: string) {
  const references = filePath.endsWith(".css")
    ? extractCssReferences(sourceText)
    : [...extractModuleReferences(sourceText, filePath), ...(isProductionResourceSource(filePath) ? extractResourceReferences(sourceText, filePath) : [])];
  return references.flatMap((reference) => {
    const violation = violationForReference(filePath, reference);
    return violation ? [violation] : [];
  });
}

function listVersionedSourceFiles(): string[] {
  const files = execFileSync("git", ["ls-files", "-z", "--", "src"], { cwd: process.cwd(), encoding: "utf8" }).split("\0");
  return files.filter((relative) => relative.startsWith("src/") && (sourceExtensions.test(relative) || relative.endsWith(".css"))).map((relative) => {
    if (path.posix.normalize(relative) !== relative || relative.includes("\\")) throw new Error("版本化源码路径不规范");
    let current = process.cwd();
    for (const part of relative.split("/")) {
      current = path.join(current, part);
      if (lstatSync(current).isSymbolicLink()) throw new Error("源码检查不跟随符号链接或目录联接");
    }
    if (!lstatSync(current).isFile()) throw new Error("版本化源码缺失或不是普通文件");
    return current;
  });
}

function scanCurrentSourceTree() {
  const files = listVersionedSourceFiles();
  const violations = files.flatMap((filePath) =>
      scanModuleSource(filePath, readFileSync(filePath, "utf8")),
    );
  console.info("ART_SOURCE_SCAN_RESULT " + JSON.stringify({
    files: files.map((filePath) => normalizePath(path.relative(process.cwd(), filePath))),
    versionedSourceCount: files.length,
    productionResourceCount: files.filter(isProductionResourceSource).length,
    violations,
  }));
  return violations;
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

// ART_CASE_PLAN_BEGIN：先冻结字面量预期，保留已有覆盖与新增缺口的区别。
const visualExamples = [
  {"id":"VIS_CROSS_ALIAS","file":"features/alpha/view.tsx","source":"import styles from '@/features/beta/view.module.css';","specifier":"@/features/beta/view.module.css","want":"Feature internals are private."},
  {"id":"VIS_CROSS_RELATIVE","file":"features/alpha/view.tsx","source":"import styles from '../beta/view.module.css';","specifier":"../beta/view.module.css","want":"A Feature cannot reach another Feature through a relative path."},
  {"id":"VIS_CROSS_RELATIVE_DOTS","file":"features/alpha/view.tsx","source":"import styles from './parts/../../beta/view.module.css';","specifier":"./parts/../../beta/view.module.css","want":"A Feature cannot reach another Feature through a relative path."},
  {"id":"VIS_ALIAS_DOTS","file":"features/alpha/view.tsx","source":"import styles from '@/shared/../features/beta/view.module.css';","specifier":"@/shared/../features/beta/view.module.css","want":"Feature internals are private."},
  {"id":"VIS_CSS_IMPORT","file":"features/alpha/view.module.css","source":"@import '../beta/view.module.css';","specifier":"../beta/view.module.css","want":"A Feature cannot reach another Feature through a relative path."},
  {"id":"VIS_PRIVATE_SHARED","file":"features/alpha/view.tsx","source":"import styles from '@/shared/contracts/private.css';","specifier":"@/shared/contracts/private.css","want":"Visual files must come from shared/visual-system or the Feature's own CSS Module."},
  {"id":"VIS_ENCODED_EXTENSION","file":"features/alpha/view.tsx","source":"import styles from '@/shared/contracts/private%2ecss';","specifier":"@/shared/contracts/private%2ecss","want":"Visual files must come from shared/visual-system or the Feature's own CSS Module."},
  {"id":"VIS_OWN_GLOBAL_CSS","file":"features/alpha/view.tsx","source":"import './global.css';","specifier":"./global.css","want":"Visual files must come from shared/visual-system or the Feature's own CSS Module."},
  {"id":"SHARED_ALIAS","file":"shared/visual-system/view.ts","source":"import { value } from '@/features/beta';","specifier":"@/features/beta","want":"Shared modules cannot depend on Feature modules."},
  {"id":"SHARED_RELATIVE","file":"shared/visual-system/view.ts","source":"import { value } from '../../features/beta';","specifier":"../../features/beta","want":"Shared modules cannot depend on Feature modules."},
  {"id":"SHARED_ALIAS_DOTS","file":"shared/visual-system/view.ts","source":"import { value } from '@/shared/../features/beta';","specifier":"@/shared/../features/beta","want":"Shared modules cannot depend on Feature modules."},
  {"id":"SHARED_REEXPORT","file":"shared/visual-system/view.ts","source":"export { value } from '@/features/beta';","specifier":"@/features/beta","want":"Shared modules cannot depend on Feature modules."},
  {"id":"SHARED_REQUIRE","file":"shared/visual-system/view.ts","source":"const value = require('../../features/beta');","specifier":"../../features/beta","want":"Shared modules cannot depend on Feature modules."},
  {"id":"SHARED_DYNAMIC_IMPORT","file":"shared/visual-system/view.ts","source":"const value = import('@/features/beta');","specifier":"@/features/beta","want":"Shared modules cannot depend on Feature modules."},
  {"id":"SHARED_IMPORT_TYPE","file":"shared/visual-system/view.ts","source":"type Value = import('../../features/beta').Value;","specifier":"../../features/beta","want":"Shared modules cannot depend on Feature modules."},
  {"id":"SHARED_IMPORT_EQUALS","file":"shared/visual-system/view.ts","source":"import Value = require('@/features/beta');","specifier":"@/features/beta","want":"Shared modules cannot depend on Feature modules."},
  {"id":"SHARED_CSS_IMPORT","file":"shared/visual-system/theme.css","source":"@import '../../features/beta/view.module.css';","specifier":"../../features/beta/view.module.css","want":"Shared modules cannot depend on Feature modules."},
  {"id":"TEMP_IMPORT","file":"app/page.tsx","source":"import image from 'C:/Temp/design-a.png';","specifier":"C:/Temp/design-a.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_JSX_SRC","file":"app/page.tsx","source":"export const view = <img src='/tmp/design-a.png' />;","specifier":"/tmp/design-a.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_JSX_EXPRESSION","file":"app/page.tsx","source":"export const view = <img src={'/var/tmp/design-b.webp'} />;","specifier":"/var/tmp/design-b.webp","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_IDENTIFIER","file":"app/page.tsx","source":"const image = '/tmp/design-c.svg'; export const view = <img src={image} />;","specifier":"/tmp/design-c.svg","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_NEW_URL","file":"app/page.tsx","source":"const image = new URL('file:///C:/Users/Sample/AppData/Local/Temp/design-d.jpeg', import.meta.url);","specifier":"file:///C:/Users/Sample/AppData/Local/Temp/design-d.jpeg","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_INLINE_STYLE","file":"features/alpha/view.tsx","source":"export const view = <div style={{ backgroundImage: 'url(\"/tmp/design-e.png\")' }} />;","specifier":"/tmp/design-e.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_OBJECT_SRC","file":"app/page.tsx","source":"const image = { src: '%TEMP%/design-f.png' };","specifier":"%TEMP%/design-f.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_TS_GENERIC","file":"app/resource.ts","source":"const identity = <T>(value: T) => value; const image = { src: '/tmp/typed-resource.png' };","specifier":"/tmp/typed-resource.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_ASSIGNMENT","file":"app/page.tsx","source":"image.src = 'C:/Windows/Temp/design-g.png';","specifier":"C:/Windows/Temp/design-g.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_SET_ATTRIBUTE","file":"app/page.tsx","source":"image.setAttribute('src', '/tmp/design-h.png');","specifier":"/tmp/design-h.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_CSS_URL","file":"features/alpha/view.module.css","source":".view { background-image: url('/tmp/design-i.png'); }","specifier":"/tmp/design-i.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_CSS_UNQUOTED_URL","file":"features/alpha/view.module.css","source":".view { background-image: URL(C:/Temp/design-j.png); }","specifier":"C:/Temp/design-j.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_CSS_ESCAPE","file":"features/alpha/view.module.css","source":".view { background-image: url('/t\\65 mp/design-k.png'); }","specifier":"/temp/design-k.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_ENCODED_PATH","file":"app/page.tsx","source":"export const view = <img src='/tm%70/design-l.png' />;","specifier":"/tm%70/design-l.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_SRCSET","file":"app/page.tsx","source":"export const view = <img srcSet='/art/safe.png 1x, /tmp/design-m.png 2x' />;","specifier":"/tmp/design-m.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"TEMP_TEMPLATE","file":"app/page.tsx","source":"export const view = <img src={`/tmp/${name}.png`} />;","specifier":"/tmp/${dynamic}.png","want":"Production resources cannot reference temporary attachment paths."},
  {"id":"ALLOW_OWN_MODULE","file":"features/alpha/view.tsx","source":"import styles from './view.module.css';","specifier":"","want":""},
  {"id":"ALLOW_SHARED_VISUAL_CSS","file":"features/alpha/view.tsx","source":"import '@/shared/visual-system/tokens.css';","specifier":"","want":""},
  {"id":"ALLOW_SHARED_VISUAL_MODULE","file":"features/alpha/view.tsx","source":"import { value } from '@/shared/visual-system';","specifier":"","want":""},
  {"id":"ALLOW_PUBLIC_FEATURE","file":"features/alpha/view.tsx","source":"import { value } from '@/features/beta';","specifier":"","want":""},
  {"id":"ALLOW_NONVISUAL_SHARED","file":"features/alpha/view.tsx","source":"import type { Contract } from '@/shared/contracts';","specifier":"","want":""},
  {"id":"ALLOW_SHARED_LOCAL","file":"shared/visual-system/view.ts","source":"import { value } from '../contracts';","specifier":"","want":""},
  {"id":"ALLOW_CSS_OWN_MODULE","file":"features/alpha/view.module.css","source":"@import './parts.module.css';","specifier":"","want":""},
  {"id":"ALLOW_NORMAL_IMAGE","file":"app/page.tsx","source":"export const view = <img src='/art/executor/decoration.png' />;","specifier":"","want":""},
  {"id":"ALLOW_PLAIN_TEXT","file":"app/page.tsx","source":"const instructions = '/tmp/example.png'; export const view = <p>{instructions}</p>;","specifier":"","want":""},
  {"id":"ALLOW_TS_COMMENT","file":"app/page.tsx","source":"// import image from 'C:/Temp/comment.png';\nexport const value = 1;","specifier":"","want":""},
  {"id":"ALLOW_CSS_COMMENT","file":"features/alpha/view.module.css","source":"/* .view { background: url('/tmp/comment.png'); } */ .view { color: blue; }","specifier":"","want":""},
  {"id":"ALLOW_CSS_TEXT","file":"features/alpha/view.module.css","source":".view::before { content: 'url(\"/tmp/text.png\")'; }","specifier":"","want":""},
  {"id":"ALLOW_TEST_FIXTURE","file":"features/alpha/view.test.tsx","source":"const sample = <img src='/tmp/synthetic.png' />;","specifier":"","want":""},
  {"id":"ALLOW_FIXTURE_STRING","file":"app/page.tsx","source":"const sample = \"import image from '/tmp/synthetic.png';\";","specifier":"","want":""}
] as const;
// ART_CASE_PLAN_END

describe("visual boundary contracts", () => {
  it.each(visualExamples)("ART_CASE $id", (example) => {
    const filePath = syntheticPath(...example.file.split("/"));
    const violations = scanModuleSource(filePath, example.source);
    console.info("ART_CASE_RESULT " + JSON.stringify({
      case_id: example.id, filePath: normalizePath(filePath),
      expectedSpecifier: example.specifier, expectedReason: example.want,
      violations,
    }));
    if (!example.want) {
      expect(violations).toEqual([]);
    } else {
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({
        filePath: normalizePath(filePath), specifier: example.specifier,
      });
      expect(violations[0]?.reason).toContain(example.want);
    }
  });
});
