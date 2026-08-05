import type { Inngest, SendEventPayload } from "inngest";

import type {
  JobDispatcher,
  JobDispatchReceipt,
} from "@/application/jobs/job-dispatcher";
import {
  parseBackgroundJob,
  type BackgroundJob,
} from "@/domain/jobs/background-job";

export const inngestJobDispatcherContract = "inngest-job-dispatcher.v1" as const;

const eventNames = {
  "project.sync.requested.v1": "executor/project.sync.requested.v1",
} as const;

const providerIdPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/;

type InngestSendClient = Pick<Inngest, "send">;

export type InngestBackgroundJobEvent = SendEventPayload & {
  id: string;
  name: (typeof eventNames)[keyof typeof eventNames];
  data: BackgroundJob;
};

function isProviderRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }

  const { status } = error as { status?: unknown };
  return typeof status === "number" && status >= 400 && status <= 599;
}

function mapProviderReceipt(receipt: unknown): JobDispatchReceipt {
  if (typeof receipt !== "object" || receipt === null || !("ids" in receipt)) {
    throw new Error("inngest_dispatch_receipt_invalid");
  }

  const { ids } = receipt as { ids?: unknown };
  if (
    !Array.isArray(ids)
    || ids.length !== 1
    || typeof ids[0] !== "string"
    || !providerIdPattern.test(ids[0])
  ) {
    throw new Error("inngest_dispatch_receipt_invalid");
  }

  return { providerJobId: ids[0] };
}

export function mapBackgroundJobToInngestEvent(
  input: unknown,
): InngestBackgroundJobEvent {
  const job = parseBackgroundJob(input);

  return {
    id: `job:${job.projectId}:${job.idempotencyKey}`,
    name: eventNames[job.jobType],
    data: job,
  };
}

export class InngestJobDispatcher implements JobDispatcher {
  constructor(private readonly client: InngestSendClient) {}

  async dispatch(input: BackgroundJob): Promise<JobDispatchReceipt> {
    const event = mapBackgroundJobToInngestEvent(input);
    let receipt: unknown;

    try {
      receipt = await this.client.send(event);
    } catch (error) {
      throw new Error(
        isProviderRejection(error)
          ? "inngest_dispatch_rejected"
          : "inngest_transport_failed",
      );
    }

    return mapProviderReceipt(receipt);
  }
}
