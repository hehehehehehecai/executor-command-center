import type { DecisionRecord } from "./decision-archive-view-model";

export type DecisionArchiveReadResult =
  | { readonly kind: "not_enabled"; readonly userId: string; readonly projectId: string }
  | { readonly kind: "ready"; readonly userId: string; readonly projectId: string;
      readonly records: readonly { readonly userId: string; readonly projectId: string; readonly record: DecisionRecord }[] };

/** Read-only boundary. T09 supplies persistence; no guessed table or write API. */
export interface DecisionArchiveReadPort {
  read(input: { readonly userId: string; readonly projectId: string }): Promise<DecisionArchiveReadResult>;
}

export class NotEnabledDecisionArchiveReadPort implements DecisionArchiveReadPort {
  async read(input: { readonly userId: string; readonly projectId: string }): Promise<DecisionArchiveReadResult> {
    return { kind: "not_enabled", ...input };
  }
}
