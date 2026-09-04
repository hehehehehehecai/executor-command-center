import type {
  RunDailyRepositoryReconciliation,
} from "@/application/synchronization/reconciliation-use-cases";

export class DailyReconciliationSchedulerAdapter {
  constructor(private readonly useCase: Pick<RunDailyRepositoryReconciliation, "execute">) {}

  handle(input: { readonly scheduledAt: string; readonly signal?: AbortSignal }) {
    return this.useCase.execute(input);
  }
}
