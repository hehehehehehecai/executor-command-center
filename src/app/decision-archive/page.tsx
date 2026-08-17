import {
  decisionArchivePreviewFixture,
  loadDecisionArchivePreviewFixture,
} from "@/content/demo-data/decision-archive-preview-fixture";
import {
  DecisionArchivePanel,
  confirmDecisionCandidate,
  createDecisionArchiveConnectedQuery,
  createDecisionArchivePreviewQuery,
  createManualDecisionRecord,
  type DecisionActionContext,
  type DecisionArchiveConnectedPort,
  type DecisionArchiveFeedback,
  type DecisionArchiveViewModel,
} from "@/features/decision-archive";
import { parsePanelMode, type PanelMode } from "@/shared/panel-query";

export const dynamic = "force-dynamic";

type DecisionArchiveSearchParams = {
  readonly action?: string | string[];
  readonly alternatives?: string | string[];
  readonly candidateId?: string | string[];
  readonly decision?: string | string[];
  readonly mode?: string | string[];
  readonly reason?: string | string[];
  readonly revisitCondition?: string | string[];
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function requestedMode(value: string | string[] | undefined): PanelMode | "invalid" {
  if (value === undefined) return "preview";
  if (typeof value !== "string") return "invalid";

  try {
    return parsePanelMode(value);
  } catch {
    return "invalid";
  }
}

function statusShell(message: string) {
  return (
    <main className="auth-status-shell">
      <p className="section-kicker">Decision Archive</p>
      <h1>Decision Archive</h1>
      <p>{message}</p>
    </main>
  );
}

const unavailableConnectedPort: DecisionArchiveConnectedPort = {
  load: async () => {
    throw new Error("decision_archive_connected_unavailable");
  },
};

function feedbackFor(error: unknown): DecisionArchiveFeedback {
  const code = error instanceof Error ? error.message : "unknown";

  switch (code) {
    case "decision_confirmation_reason_required":
      return { kind: "error", message: "确认原因不能为空。" };
    case "decision_content_required":
      return { kind: "error", message: "决定内容不能为空。" };
    case "decision_candidate_not_found":
      return { kind: "error", message: "找不到指定 Candidate。" };
    case "decision_candidate_already_confirmed":
      return { kind: "error", message: "该 Candidate 已经确认，不能重复生成 Record。" };
    case "decision_action_context_unavailable":
      return { kind: "error", message: "本地操作上下文不可用。" };
    default:
      return { kind: "error", message: "本地决策操作失败。" };
  }
}

function applyLocalAction(
  viewModel: DecisionArchiveViewModel,
  searchParams: DecisionArchiveSearchParams,
  context: DecisionActionContext | undefined,
) {
  const action = single(searchParams.action);
  if (action === undefined) return { viewModel };

  try {
    if (context === undefined) {
      throw new Error("decision_action_context_unavailable");
    }

    if (action === "manual") {
      return {
        viewModel: createManualDecisionRecord(
          viewModel,
          {
            decision: single(searchParams.decision) ?? "",
            confirmationReason: single(searchParams.reason) ?? "",
            alternatives: (single(searchParams.alternatives) ?? "").split(/\r?\n/),
            references: [],
            revisitCondition: single(searchParams.revisitCondition) ?? null,
          },
          context,
        ),
        feedback: {
          kind: "success",
          message: "本地记录预览已生成；未持久化。",
        } as const,
      };
    }

    if (action === "confirm") {
      return {
        viewModel: confirmDecisionCandidate(
          viewModel,
          {
            candidateId: single(searchParams.candidateId) ?? "",
            confirmationReason: single(searchParams.reason) ?? "",
          },
          context,
        ),
        feedback: {
          kind: "success",
          message: "Candidate 已在本地确认并生成 Record 预览；未持久化。",
        } as const,
      };
    }

    throw new Error("decision_action_invalid");
  } catch (error) {
    return { viewModel, feedback: feedbackFor(error) };
  }
}

export default async function DecisionArchivePage(input: {
  readonly searchParams: Promise<DecisionArchiveSearchParams>;
  readonly connectedPort?: DecisionArchiveConnectedPort;
  readonly localActionContext?: DecisionActionContext;
}) {
  const searchParams = await input.searchParams;
  const mode = requestedMode(searchParams.mode);

  if (mode === "invalid") {
    return statusShell("面板模式无效。");
  }

  const query =
    mode === "preview"
      ? createDecisionArchivePreviewQuery(loadDecisionArchivePreviewFixture)
      : createDecisionArchiveConnectedQuery(
          input.connectedPort ?? unavailableConnectedPort,
        );
  const result = await query
    .load()
    .then((viewModel) => ({ kind: "success", viewModel }) as const)
    .catch(() => ({ kind: "failure" }) as const);

  if (result.kind === "failure") {
    return statusShell(
      mode === "preview"
        ? "演示数据暂时不可用。"
        : "Connected 数据暂时不可用。",
    );
  }

  const actionResult = applyLocalAction(
    result.viewModel,
    searchParams,
    input.localActionContext ??
      (mode === "preview"
        ? decisionArchivePreviewFixture.localActionContext
        : undefined),
  );

  return (
    <DecisionArchivePanel
      viewModel={actionResult.viewModel}
      feedback={actionResult.feedback}
    />
  );
}
