import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const manifestPath = resolve(
  repositoryRoot,
  "tests/fixtures/synchronization/stage3-phase8-scope-reconciliation.json",
);
const correctionFreezePath = resolve(
  repositoryRoot,
  "tests/fixtures/synchronization/stage3-phase8-1-1-pre-run-freeze.json",
);
const phase8FreezePath = resolve(
  repositoryRoot,
  "tests/fixtures/synchronization/stage3-phase8-pre-run-freeze.json",
);

const phase8BaselineCommit = "1d0f7b428a5e9de3061d1ca3d66170667efd6266";
const phase8Commit = "bf6abf137153e67f5211e7817b65ed9d23f3a1e1";
const phase8Tree = "a9460d736ea2d2ddfb894165ea752774d6948ce3";
const phase8FreezeSha256 =
  "f9f2499b20ace66ec6f5a92b81bb897f422e6d65b6bb1f8dc17449ea30603891";
const correctionFreezeSha256 =
  "80df551ba8d3edf50a39ac9496b68a87b11e3cf80a80a989508ee096b2653dba";

const expectedAllPaths = [
  "src/app/globals.css",
  "src/content/demo-data/command-deck-preview-fixture.ts",
  "src/features/command-deck/command-deck-page.test.tsx",
  "src/features/command-deck/command-deck-page.tsx",
  "src/features/project-galaxy/SyncStatusBadge.test.tsx",
  "src/features/project-galaxy/SyncStatusBadge.tsx",
  "src/features/project-galaxy/freshness-presentation.test.ts",
  "src/features/project-galaxy/freshness-presentation.ts",
  "src/features/project-galaxy/index.ts",
  "tests/e2e/command-deck.spec.ts",
  "tests/fixtures/synchronization/stage3-phase8-pre-run-freeze.json",
] as const;

const expectedFrozenPaths = [
  "src/app/globals.css",
  "src/content/demo-data/command-deck-preview-fixture.ts",
  "src/features/command-deck/command-deck-page.test.tsx",
  "src/features/command-deck/command-deck-page.tsx",
  "src/features/project-galaxy/SyncStatusBadge.test.tsx",
  "src/features/project-galaxy/SyncStatusBadge.tsx",
  "src/features/project-galaxy/freshness-presentation.test.ts",
  "src/features/project-galaxy/freshness-presentation.ts",
  "tests/fixtures/synchronization/stage3-phase8-pre-run-freeze.json",
] as const;

const expectedLateDiscoveredPaths = [
  {
    path: "src/features/project-galaxy/index.ts",
    classification: "late_discovered_not_pre_authorized_by_phase8_freeze",
    reason: "public_feature_boundary",
  },
  {
    path: "tests/e2e/command-deck.spec.ts",
    classification: "late_discovered_not_pre_authorized_by_phase8_freeze",
    reason: "direct_360px_e2e",
  },
] as const;

const expectedOriginalAllowedPaths = [
  "src/features/project-galaxy/SyncStatusBadge.tsx",
  "src/features/project-galaxy/freshness-presentation.ts",
  "src/features/project-galaxy/*.test.ts",
  "src/features/project-galaxy/*.test.tsx",
  "src/features/command-deck/command-deck-page.tsx",
  "src/features/command-deck/command-deck-page.test.tsx",
  "src/content/demo-data/command-deck-preview-fixture.ts",
  "src/app/globals.css",
  "tests/fixtures/synchronization/stage3-phase8-pre-run-freeze.json",
] as const;

const allowedCorrectionPaths = new Set([
  "src/features/project-galaxy/phase8-scope-conformance.test.ts",
  "tests/fixtures/synchronization/stage3-phase8-1-1-pre-run-freeze.json",
  "tests/fixtures/synchronization/stage3-phase8-scope-reconciliation.json",
]);

interface ScopeReconciliationManifest {
  readonly contractVersion: string;
  readonly phase8BaselineCommit: string;
  readonly phase8Commit: string;
  readonly phase8Tree: string;
  readonly phase8Parent: string;
  readonly phase8FreezeSha256: string;
  readonly correctionFreezeSha256: string;
  readonly sourceReviewTicket: string;
  readonly sourceIndependentEvidence: string;
  readonly allPhase8DiffPaths: readonly string[];
  readonly frozenPaths: readonly string[];
  readonly lateDiscoveredPaths: ReadonlyArray<{
    readonly path: string;
    readonly classification: string;
    readonly reason: string;
  }>;
  readonly phase8FileBlobs: Readonly<Record<string, string>>;
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function exactSet(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function patternMatches(pattern: string, path: string): boolean {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${expression}$`).test(path);
}

function validateManifest(manifest: ScopeReconciliationManifest): void {
  const latePaths = manifest.lateDiscoveredPaths.map(({ path }) => path);

  if (
    !unique(manifest.allPhase8DiffPaths) ||
    !unique(manifest.frozenPaths) ||
    !unique(latePaths)
  ) {
    throw new Error("phase8_scope_duplicate_path");
  }
  if (!exactSet(manifest.allPhase8DiffPaths, expectedAllPaths)) {
    throw new Error("phase8_scope_unknown_path");
  }
  if (!exactSet(manifest.frozenPaths, expectedFrozenPaths)) {
    throw new Error("phase8_scope_frozen_partition_invalid");
  }
  if (!exactSet(latePaths, expectedLateDiscoveredPaths.map(({ path }) => path))) {
    throw new Error("phase8_scope_late_partition_invalid");
  }

  const intersection = manifest.frozenPaths.filter((path) => latePaths.includes(path));
  const union = [...manifest.frozenPaths, ...latePaths];
  if (intersection.length !== 0 || !exactSet(union, manifest.allPhase8DiffPaths)) {
    throw new Error("phase8_scope_partition_invalid");
  }
}

describe("phase8-freeze-diff-conformance.v1", () => {
  if (!existsSync(manifestPath)) {
    it("requires the immutable scope reconciliation manifest", () => {
      expect(existsSync(manifestPath)).toBe(true);
    });
    return;
  }

  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as ScopeReconciliationManifest;
  const originalFreeze = JSON.parse(readFileSync(phase8FreezePath, "utf8")) as {
    readonly allowedPaths: readonly string[];
  };

  it("binds the governance contract to the fixed review and Git lineage", () => {
    expect(sha256(correctionFreezePath)).toBe(correctionFreezeSha256);
    expect({
      contractVersion: manifest.contractVersion,
      phase8BaselineCommit: manifest.phase8BaselineCommit,
      phase8Commit: manifest.phase8Commit,
      phase8Tree: manifest.phase8Tree,
      phase8Parent: manifest.phase8Parent,
      phase8FreezeSha256: manifest.phase8FreezeSha256,
      correctionFreezeSha256: manifest.correctionFreezeSha256,
      sourceReviewTicket: manifest.sourceReviewTicket,
      sourceIndependentEvidence: manifest.sourceIndependentEvidence,
    }).toEqual({
      contractVersion: "phase8-freeze-diff-conformance.v1",
      phase8BaselineCommit,
      phase8Commit,
      phase8Tree,
      phase8Parent: phase8BaselineCommit,
      phase8FreezeSha256,
      correctionFreezeSha256,
      sourceReviewTicket:
        "sha256:b49f74c752e668889b24e874ef2c6c898ce4fb017ae025c8a1724e27fab5d1e9",
      sourceIndependentEvidence:
        "sha256:cdeb8ab179676f8673bc3b3c7d432e29e74d2d28413d571366d39a2cf1ad716f",
    });
  });

  it("partitions the exact 11 paths into disjoint 9 frozen and 2 late paths", () => {
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.allPhase8DiffPaths).toHaveLength(11);
    expect(manifest.frozenPaths).toHaveLength(9);
    expect(manifest.lateDiscoveredPaths).toEqual(expectedLateDiscoveredPaths);
  });

  it("preserves the original Freeze gap instead of broadening its coverage", () => {
    expect(originalFreeze.allowedPaths).toEqual(expectedOriginalAllowedPaths);
    expect(sha256(phase8FreezePath)).toBe(phase8FreezeSha256);

    const covered = expectedAllPaths.filter((path) =>
      originalFreeze.allowedPaths.some((pattern) => patternMatches(pattern, path)),
    );
    const uncovered = expectedAllPaths.filter((path) => !covered.includes(path));

    expect(covered).toEqual(expectedFrozenPaths);
    expect(uncovered).toEqual(expectedLateDiscoveredPaths.map(({ path }) => path));
  });

  it("matches the immutable Phase 8 Git diff and every committed file blob", () => {
    const actualPaths = git([
      "diff",
      "--name-only",
      `${phase8BaselineCommit}..${phase8Commit}`,
    ]).split(/\r?\n/u);
    expect(actualPaths).toEqual(expectedAllPaths);
    expect(git(["rev-parse", `${phase8Commit}^{tree}`])).toBe(phase8Tree);

    for (const path of expectedAllPaths) {
      expect(manifest.phase8FileBlobs[path]).toBe(
        git(["rev-parse", `${phase8Commit}:${path}`]),
      );
      expect(git(["rev-parse", `HEAD:${path}`])).toBe(
        manifest.phase8FileBlobs[path],
      );
    }
  });

  it("allows only the three Phase 8.1.1 paths in the correction worktree", () => {
    const status = git(["status", "--porcelain", "--untracked-files=all"]);
    const changedPaths = status === ""
      ? []
      : status.split(/\r?\n/u).map((line) => line.slice(3));

    expect(changedPaths.every((path) => allowedCorrectionPaths.has(path))).toBe(true);
    expect(changedPaths.some((path) => expectedAllPaths.includes(path as never))).toBe(
      false,
    );
  });

  it("rejects any third path even when it shares an allowed directory prefix", () => {
    const candidate: ScopeReconciliationManifest = {
      ...manifest,
      allPhase8DiffPaths: [
        ...manifest.allPhase8DiffPaths,
        "src/features/project-galaxy/unplanned-third-path.ts",
      ],
    };

    expect(() => validateManifest(candidate)).toThrow("phase8_scope_unknown_path");
  });

  it("rejects duplicate paths rather than hiding denominator inflation", () => {
    const candidate: ScopeReconciliationManifest = {
      ...manifest,
      allPhase8DiffPaths: [
        ...manifest.allPhase8DiffPaths,
        "src/app/globals.css",
      ],
    };

    expect(() => validateManifest(candidate)).toThrow("phase8_scope_duplicate_path");
  });
});
