import { parseBackgroundJob } from "@/domain/jobs/background-job";

import {
  jobDispatcherContract,
  type JobDispatcher,
  type JobDispatchReceipt,
} from "./job-dispatcher";

export { jobDispatcherContract };

export class DispatchBackgroundJob {
  constructor(private readonly dispatcher: JobDispatcher) {}

  async execute(input: unknown): Promise<JobDispatchReceipt> {
    return this.dispatcher.dispatch(parseBackgroundJob(input));
  }
}
