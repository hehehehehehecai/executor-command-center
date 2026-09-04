import { z } from "zod";

import type { ProjectBriefEvidenceRef } from "@/domain/project-brief/project-brief-contract";
import {
  projectBriefEvidenceRefContractVersion,
} from "@/domain/project-brief/project-brief-contract";
import type { AIProvider } from "@/shared/ai/ai-provider";
import { createStructuredGenerationRequest } from "@/shared/ai/structured-generation-request";
import type { StructuredGenerationMetadata } from "@/shared/ai/structured-generation-result";

import type { LoadValidatedProjectBriefUseCase } from "./load-validated-project-brief";

export const projectBriefFollowUpContractVersion =
  "project-brief-follow-up.v1" as const;
export const projectBriefFollowUpSchemaVersion =
  "project-brief-follow-up-schema.v1" as const;
export const projectBriefFollowUpBoundaryNote =
  "回答仅限当前已验证 Brief 与 Evidence；不使用外部知识、工具或对话历史。" as const;

export const projectBriefFollowUpFailureCodes = [
  "follow_up_invalid_request",
  "follow_up_out_of_scope",
  "follow_up_evidence_invalid",
  "follow_up_unavailable",
] as const;
export type ProjectBriefFollowUpFailureCode =
  (typeof projectBriefFollowUpFailureCodes)[number];

export class ProjectBriefFollowUpError extends Error {
  readonly name = "ProjectBriefFollowUpError";
  constructor(readonly code: ProjectBriefFollowUpFailureCode) {
    super(code);
  }
  toJSON() {
    return { name: this.name, code: this.code };
  }
}

const uuid = z.string().uuid();
const canonicalUtc = z.iso.datetime({ offset: true });
const inputSchema = z.object({
  actorUserId: uuid,
  projectId: uuid,
  briefId: uuid,
  question: z.string().trim().min(1).max(500),
  evidenceReferenceIds: z.array(z.string().trim().min(1).max(1_024)).max(10),
  now: canonicalUtc,
}).strict();

const refSchema = z.object({
  contractVersion: z.literal(projectBriefEvidenceRefContractVersion),
  sourceKind: z.enum([
    "project_profile",
    "github_commit",
    "github_issue",
    "github_pull_request",
    "github_release",
    "github_workflow_run",
    "github_document",
    "confirmed_decision",
    "freshness",
  ]),
  sourceId: z.string().trim().min(1).max(255),
  projectId: uuid,
}).strict();

const responseSchema = z.object({
  answer: z.string().trim().min(1).max(2_000).nullable(),
  evidenceRefs: z.array(refSchema).max(10),
  unknowns: z.array(z.string().trim().min(1).max(500)).max(10),
  boundaryNote: z.literal(projectBriefFollowUpBoundaryNote),
}).strict().superRefine((value, context) => {
  const answered = value.answer !== null;
  if (
    (answered && value.evidenceRefs.length === 0)
    || (!answered && (value.evidenceRefs.length > 0 || value.unknowns.length === 0))
  ) {
    context.addIssue({ code: "custom", message: "follow_up_response_invalid" });
  }
});

const forbiddenScopePatterns = [
  /联网|搜索|外部知识|新闻|天气|股价|股票|汇率|行情|internet|web search|stock price/i,
  /执行|运行|工具调用|tool call|SQL|代码执行/i,
  /system prompt|提示词|secret|api\s*key|内部日志|snapshot\s*原文/i,
  /推断.*动机|最终决策|替我决定|authorize/i,
  /之前.*聊天|历史对话|继续.*对话|messages/i,
];
const allowedQuestionPatterns = [
  /^(?:请|请问|帮我)?(?:根据|基于)?(?:当前|这个)?(?:项目)?简报(?:中|里|中的|里的)?(?:已经)?完成(?:了)?(?:什么|哪些(?:事项|变更|工作)?)?[？?]?$/i,
  /^(?:请|请问|帮我)?(?:根据|基于)?(?:当前|这个)?(?:项目)?简报(?:中|里|中的|里的)?(?:摘要|官方状态|状态|已完成变更|进行中工作|待处理事项|风险信号|风险|未知项|缺失证据|证据|freshness|boundary)(?:是什么|有哪些|如何|情况|内容|怎么样)?[？?]?$/i,
  /^(?:请|请问|帮我)?(?:说明|列出|总结|展示|解释)?(?:当前|这个)?项目(?:的)?(?:摘要|官方状态|状态|已完成变更|进行中工作|待处理事项|风险信号|风险|未知项|缺失证据|证据|freshness|boundary)(?:是什么|有哪些|如何|情况|内容|怎么样)?[？?]?$/i,
];

function fail(code: ProjectBriefFollowUpFailureCode): never {
  throw new ProjectBriefFollowUpError(code);
}

export function projectBriefFollowUpEvidenceReferenceId(
  ref: Pick<ProjectBriefEvidenceRef, "sourceKind" | "sourceId" | "projectId">,
) {
  return JSON.stringify([ref.sourceKind, ref.sourceId, ref.projectId]);
}

function stableUnique(values: readonly string[]) {
  return [...new Set(values)];
}

function providerPrompt(input: {
  readonly question: string;
  readonly brief: Awaited<ReturnType<LoadValidatedProjectBriefUseCase["execute"]>>["brief"];
  readonly evidenceRefs: readonly ProjectBriefEvidenceRef[];
}) {
  return JSON.stringify({
    contractVersion: projectBriefFollowUpContractVersion,
    schemaVersion: projectBriefFollowUpSchemaVersion,
    question: input.question,
    brief: {
      projectId: input.brief.projectId,
      rangeStart: input.brief.rangeStart,
      rangeEnd: input.brief.rangeEnd,
      officialStatus: input.brief.officialStatus,
      summary: input.brief.summary,
      completedChanges: input.brief.completedChanges,
      ongoingWork: input.brief.ongoingWork,
      openItems: input.brief.openItems,
      riskSignals: input.brief.riskSignals,
      unknowns: input.brief.unknowns,
      freshness: input.brief.freshness,
      boundaryNote: input.brief.boundaryNote,
    },
    allowedEvidenceRefs: input.evidenceRefs,
  });
}

export interface ProjectBriefFollowUpSuccess {
  readonly contractVersion: typeof projectBriefFollowUpContractVersion;
  readonly schemaVersion: typeof projectBriefFollowUpSchemaVersion;
  readonly status: "answered" | "unknown";
  readonly answer: string | null;
  readonly evidenceRefs: readonly ProjectBriefEvidenceRef[];
  readonly unknowns: readonly string[];
  readonly boundaryNote: typeof projectBriefFollowUpBoundaryNote;
  readonly metadata: StructuredGenerationMetadata;
}

export class FollowUpProjectBriefUseCase {
  constructor(private readonly dependencies: {
    readonly briefLoader: Pick<LoadValidatedProjectBriefUseCase, "execute">;
    readonly provider: AIProvider;
  }) {}

  async execute(rawInput: unknown): Promise<ProjectBriefFollowUpSuccess> {
    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) return fail("follow_up_invalid_request");
    const input = {
      ...parsed.data,
      evidenceReferenceIds: stableUnique(parsed.data.evidenceReferenceIds),
    };
    if (
      forbiddenScopePatterns.some((pattern) => pattern.test(input.question))
      || !allowedQuestionPatterns.some((pattern) => pattern.test(input.question))
    ) {
      return fail("follow_up_out_of_scope");
    }

    const loaded = await this.dependencies.briefLoader.execute({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      now: input.now,
    });
    if (loaded.briefId !== input.briefId) return fail("follow_up_evidence_invalid");
    const allowlist = new Map(
      loaded.brief.evidenceRefs.map((ref) => [
        projectBriefFollowUpEvidenceReferenceId(ref),
        ref,
      ]),
    );
    const selected = input.evidenceReferenceIds.length === 0
      ? [...allowlist.values()]
      : input.evidenceReferenceIds.map((id) => {
          const ref = allowlist.get(id);
          if (!ref) return fail("follow_up_evidence_invalid");
          return ref;
        });

    let result;
    try {
      result = await this.dependencies.provider.generateStructured<unknown>(
        createStructuredGenerationRequest({
          systemPrompt: [
            "Return one strict JSON object for a single Project Brief follow-up.",
            "Use only the supplied validated Brief and allowed Evidence refs.",
            "Do not use external knowledge, tools, conversation history, motives, recommendations, or secrets.",
            `Use boundaryNote exactly: ${projectBriefFollowUpBoundaryNote}`,
            "A factual answer requires at least one allowed evidenceRef; otherwise answer must be null with explicit unknowns.",
          ].join("\n"),
          userPrompt: providerPrompt({
            question: input.question,
            brief: loaded.brief,
            evidenceRefs: selected,
          }),
          schemaName: "ProjectBriefFollowUpV1",
          maxOutputTokens: 2_048,
        }),
      );
    } catch {
      return fail("follow_up_unavailable");
    }
    if (result.status !== "completed") return fail("follow_up_unavailable");
    const response = responseSchema.safeParse(result.value);
    if (!response.success) return fail("follow_up_unavailable");
    const selectedIds = new Set(selected.map(projectBriefFollowUpEvidenceReferenceId));
    if (
      response.data.evidenceRefs.some((ref) =>
        !selectedIds.has(projectBriefFollowUpEvidenceReferenceId(ref)))
    ) {
      return fail("follow_up_evidence_invalid");
    }
    return {
      contractVersion: projectBriefFollowUpContractVersion,
      schemaVersion: projectBriefFollowUpSchemaVersion,
      status: response.data.answer === null ? "unknown" : "answered",
      ...response.data,
      metadata: result.metadata,
    };
  }
}
