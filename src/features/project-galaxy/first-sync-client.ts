import { z } from "zod";
import { projectSyncStatusSchema } from "@/domain/synchronization/project-onboarding-sync";
const statusResponse = z.object({ sync: projectSyncStatusSchema }).strict();
export async function readProjectSyncStatus(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/sync-status`, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(response.status === 401 ? "session_expired" : "sync_status_unavailable");
  const result = statusResponse.parse(await response.json()).sync;
  if (result.projectId !== projectId) throw new Error("sync_status_unavailable");
  return result;
}
export async function requestFirstSync(projectId: string, requestId: string) {
  const response = await fetch(`/api/projects/${projectId}/first-sync`, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId }) });
  const value = z.object({ result: z.enum(["accepted", "duplicate"]), code: z.enum(["first_sync_accepted", "first_sync_reused"]), syncRunId: z.string().uuid(), jobId: z.string().uuid() }).strict().safeParse(await response.json());
  if (!response.ok || !value.success) throw new Error("first_sync_start_failed");
}
