export const projectBriefEvalV2CaseProfileVersion =
  "project-brief-eval-case-profile.v2" as const;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const projectBriefEvalV2CaseRegistry = deepFreeze([
  {
    caseId: "eval-hist-01-explorer",
    contractVersion: "project-brief-eval-case.v2",
    contentFingerprint: "2fc700e634333bde28030c0d86bc7b7fffda0f2614db9fc0ebc1d295012cf772",
  },
  {
    caseId: "eval-hist-02-idea-graveyard",
    contractVersion: "project-brief-eval-case.v2",
    contentFingerprint: "3055e22532e77c8c628309528947e0789ab82aae3b4a2d31861ec45593142680",
  },
  {
    caseId: "eval-hist-03-brave-tavern",
    contractVersion: "project-brief-eval-case.v2",
    contentFingerprint: "c5358f035356d654266aadd9b45275f4b05f06f11b4efd8789b321d479b8eaa3",
  },
  {
    caseId: "eval-hist-04-parallelmail",
    contractVersion: "project-brief-eval-case.v2",
    contentFingerprint: "d97b0e05ffdf94fb4d9881f71e275f92363e4f3e181aeaddf18e49a878d2a556",
  },
  {
    caseId: "eval-syn-01-valid-complete",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "5d2c86a005fa0bf6f0499f3721e7a0e3055ba25f88cff20492d4292220f4b9c0",
  },
  {
    caseId: "eval-syn-02-valid-unknown",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "a3fcb206ca1c9cd4623f0cc172df9f0726bb9a4833f7f412963f7388e8cec66d",
  },
  {
    caseId: "eval-syn-03-schema-extra-field",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "2127c7faf93c4a17831d56fd57c7eb013a41da98ef161f1031453f17d44bdfca",
  },
  {
    caseId: "eval-syn-04-evidence-not-found",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "65f85b509c5c7405b38ff53d6f398c7d5a11c3ce5a0b1391f606fdcae3b8d48a",
  },
  {
    caseId: "eval-syn-05-evidence-cross-project",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "2ab4c362dfdf1c03722f933db46e9db2af8aa37f06b4cf4c072e47d7cb9bb9b7",
  },
  {
    caseId: "eval-syn-06-time-outside-range",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "15d8b3a9bef7a11f50a1f9f8bc9c7f585a8f39cc21da34ddc2767fa91c78ec98",
  },
  {
    caseId: "eval-syn-07-required-fact-missing",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "81188b7074c59ac19ea73ae6f207239e1eec7cdcc25c1aae70c81d343d3cf569",
  },
  {
    caseId: "eval-syn-08-forbidden-assertion",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "3c7d4d14044f3d1d6ef784eacb209b357e85258e0932dbc4b1af7471c2d7a34c",
  },
  {
    caseId: "eval-syn-09-unknown-leaked-as-fact",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "f0c84b0a0a07ca2452109a6faeee90fd0e6676403f5cc511dad140669b5ac601",
  },
  {
    caseId: "eval-syn-10-readability-placeholder",
    contractVersion: "project-brief-eval-case.v1",
    contentFingerprint: "2bae622e09a3caff5c1c06fe72cff2b18f3a8c8aa08974cbf587783fefffd56a",
  },
] as const);

export const projectBriefEvalDatasetV2CaseIds = deepFreeze(
  projectBriefEvalV2CaseRegistry.map(({ caseId }) => caseId),
);
