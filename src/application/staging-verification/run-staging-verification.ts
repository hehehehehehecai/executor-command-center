import type { WebhookResult } from "@/application/webhooks/ingest-github-webhook";

import type {
  StagingVerificationOperation,
} from "./staging-verification";

type Target = {
  readonly projectId: string;
  readonly installationId: number;
  readonly repositoryId: number;
  readonly repositoryFullName: string;
};

type WebhookPort = {
  execute(input: {
    readonly body: Uint8Array;
    readonly signature: string;
    readonly deliveryId: string;
    readonly eventName: string;
    readonly receivedAt: string;
  }): Promise<WebhookResult>;
};

type ReconciliationPort = {
  execute(input: { readonly scheduledAt: string }): Promise<{
    readonly window: {
      readonly requestIdentity: string;
      readonly snapshotSince: string;
    };
    readonly projects: readonly {
      readonly projectId: string;
      readonly decision: string;
      readonly changedGroups: readonly string[];
      readonly syncResult?: string;
      readonly syncRunId?: string | null;
      readonly code?: string;
    }[];
  }>;
};

type BriefGenerationPort = (input: {
  readonly mode: "controlled_failure" | "real_provider";
  readonly userId: string;
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly now: string;
  readonly requestKey: string;
}) => Promise<{
  readonly status: "cache_hit" | "generated";
  readonly energyCharged: 0 | 3;
  readonly briefId: string;
  readonly invocationId: string | null;
  readonly evidenceFingerprint: string;
}>;

type Dependencies = {
  readonly target: Target;
  readonly webhook: WebhookPort;
  readonly signWebhook: (body: Uint8Array) => string;
  readonly reconciliation: ReconciliationPort;
  readonly generate: BriefGenerationPort;
  readonly clock: { readonly now: () => Date };
  readonly ids: { readonly deliveryId: () => string };
};

const oneDayMilliseconds = 24 * 60 * 60 * 1_000;

function failure(code: string, cause?: unknown): Error {
  return new Error(code, cause === undefined ? undefined : { cause });
}

function safeFailureCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    && /^[a-z][a-z0-9_]{2,79}$/.test(error.code)
  ) {
    return error.code;
  }
  return "staging_verification_operation_failed";
}

function safeWebhookResult(result: WebhookResult) {
  return {
    result: result.result,
    code: result.code,
    httpStatus: result.httpStatus,
  };
}

function safeBriefResult(result: Awaited<ReturnType<BriefGenerationPort>>) {
  return {
    status: result.status,
    energyCharged: result.energyCharged,
    briefId: result.briefId,
    invocationId: result.invocationId,
    evidenceFingerprint: result.evidenceFingerprint,
  };
}

export class RunStagingVerification {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: {
    readonly operation: StagingVerificationOperation;
    readonly caseId: string;
    readonly projectId: string;
    readonly userId: string;
  }) {
    if (input.projectId !== this.dependencies.target.projectId) {
      throw failure("staging_verification_forbidden");
    }
    switch (input.operation) {
      case "webhook-replay":
        return this.webhookReplay();
      case "reconciliation":
        return this.reconciliation();
      case "provider-failure-retry":
        return this.providerFailureRetry(input);
      default:
        throw failure("staging_verification_operation_invalid");
    }
  }

  private async webhookReplay() {
    const receivedAt = this.dependencies.clock.now().toISOString();
    const body = new TextEncoder().encode(JSON.stringify({
      action: "edited",
      installation: { id: this.dependencies.target.installationId },
      repository: {
        id: this.dependencies.target.repositoryId,
        full_name: this.dependencies.target.repositoryFullName,
      },
    }));
    const signature = this.dependencies.signWebhook(body);
    const deliveryId = this.dependencies.ids.deliveryId();
    const differentDeliveryId = this.dependencies.ids.deliveryId();
    const request = {
      body,
      signature,
      eventName: "repository",
      receivedAt,
    } as const;
    const first = await this.dependencies.webhook.execute({ ...request, deliveryId });
    const replay = await this.dependencies.webhook.execute({ ...request, deliveryId });
    const differentDelivery = await this.dependencies.webhook.execute({
      ...request,
      deliveryId: differentDeliveryId,
    });
    return {
      operation: "webhook-replay" as const,
      first: safeWebhookResult(first),
      replay: safeWebhookResult(replay),
      differentDelivery: safeWebhookResult(differentDelivery),
      deliveryId,
      differentDeliveryId,
      duplicateSideEffectsExpected: 0 as const,
    };
  }

  private async reconciliation() {
    const result = await this.dependencies.reconciliation.execute({
      scheduledAt: this.dependencies.clock.now().toISOString(),
    });
    const project = result.projects.find(
      (candidate) => candidate.projectId === this.dependencies.target.projectId,
    );
    if (!project || result.projects.length !== 1) {
      throw failure("staging_verification_reconciliation_target_mismatch");
    }
    return {
      operation: "reconciliation" as const,
      requestIdentity: result.window.requestIdentity,
      snapshotSince: result.window.snapshotSince,
      project: {
        projectId: project.projectId,
        decision: project.decision,
        changedGroups: project.changedGroups,
        syncResult: project.syncResult ?? null,
        syncRunId: project.syncRunId ?? null,
        code: project.code ?? null,
      },
    };
  }

  private async providerFailureRetry(input: {
    readonly caseId: string;
    readonly projectId: string;
    readonly userId: string;
  }) {
    const now = this.dependencies.clock.now();
    const common = {
      userId: input.userId,
      projectId: input.projectId,
      rangeStart: new Date(now.getTime() - oneDayMilliseconds).toISOString(),
      rangeEnd: now.toISOString(),
      now: now.toISOString(),
    } as const;
    const failureInput = {
      ...common,
      mode: "controlled_failure" as const,
      requestKey: `phase8.13:${input.caseId}:failure`,
    };
    let firstFailureCode: string;
    let replayFailureCode: string;
    try {
      await this.dependencies.generate(failureInput);
      throw failure("staging_verification_controlled_failure_not_observed");
    } catch (error) {
      firstFailureCode = safeFailureCode(error);
    }
    try {
      await this.dependencies.generate(failureInput);
      throw failure("staging_verification_controlled_failure_replay_not_observed");
    } catch (error) {
      replayFailureCode = safeFailureCode(error);
    }
    if (
      firstFailureCode !== "project_brief_provider_failure"
      || replayFailureCode !== "project_brief_provider_failure"
    ) {
      throw failure("staging_verification_controlled_failure_contract_failed");
    }
    const success = await this.dependencies.generate({
      ...common,
      mode: "real_provider",
      requestKey: `phase8.13:${input.caseId}:retry`,
    });
    return {
      operation: "provider-failure-retry" as const,
      firstFailureCode,
      replayFailureCode,
      success: safeBriefResult(success),
    };
  }
}
