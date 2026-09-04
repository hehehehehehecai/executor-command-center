import type { BackgroundJob } from "@/domain/jobs/background-job";

export const jobDispatcherContract = "job-dispatcher.v1" as const;

export type JobDispatchReceipt = {
  providerJobId: string;
};

export interface JobDispatcher {
  dispatch(job: BackgroundJob): Promise<JobDispatchReceipt>;
}
