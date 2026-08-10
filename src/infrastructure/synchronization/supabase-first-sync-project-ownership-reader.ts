import "server-only";

import type { FirstSyncProjectOwnershipReader } from "@/application/synchronization/first-sync-production-entry";

type QueryResult = {
  readonly data: { readonly id?: unknown } | null;
  readonly error: unknown;
};

type SessionClient = {
  from(table: "projects"): {
    select(columns: "id"): {
      eq(column: "id", value: string): {
        eq(column: "user_id", value: string): {
          maybeSingle(): Promise<QueryResult>;
        };
      };
    };
  };
};

export class SupabaseFirstSyncProjectOwnershipReader
implements FirstSyncProjectOwnershipReader {
  constructor(private readonly client: SessionClient) {}

  async isOwnedBy(input: { readonly projectId: string; readonly userId: string }) {
    let result: QueryResult;
    try {
      result = await this.client
        .from("projects")
        .select("id")
        .eq("id", input.projectId)
        .eq("user_id", input.userId)
        .maybeSingle();
    } catch {
      throw new Error("first_sync_ownership_read_failed");
    }
    if (result.error) throw new Error("first_sync_ownership_read_failed");
    return result.data?.id === input.projectId;
  }
}
