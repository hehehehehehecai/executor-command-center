import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { workspaceEnvironment } from "@/infrastructure/workspace/workspace-server-context";
import { trustedWorkspaceMutation, workspaceHeaders } from "@/infrastructure/workspace/workspace-http";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!trustedWorkspaceMutation(request, process.env.APP_ORIGIN)) return Response.json({ error: { code: "origin_forbidden" } }, { status: 403, headers: workspaceHeaders() });
  // No caller-supplied identity or redirect is accepted. Supabase signs out only
  // the session from this request. Buffer cookie changes until confirmed success.
  try {
    if (new URL(request.url).search || (await request.text()).trim()) return Response.json({ error: { code: "invalid_request" } }, { status: 400, headers: workspaceHeaders() });
    const environment = workspaceEnvironment();
    const cookieStore = await cookies();
    const changes: Parameters<typeof cookieStore.set>[] = [];
    const headers = new Headers();
    const client = createSupabaseServerClient({ environment, responseHeaders: headers, cookieStore: {
      getAll: () => cookieStore.getAll(),
      set: (name, value, options) => { changes.push([name, value, options]); },
    } });
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return Response.json({ error: { code: "sign_out_failed" } }, { status: 503, headers: workspaceHeaders() });
    for (const args of changes) cookieStore.set(...args);
    return Response.json({ signedOut: true, redirectTo: "/?signedOut=1" }, { headers: workspaceHeaders(headers) });
  } catch {
    return Response.json({ error: { code: "sign_out_unavailable" } }, { status: 503, headers: workspaceHeaders() });
  }
}

export async function GET() {
  return Response.json({ error: { code: "method_not_allowed" } }, { status: 405, headers: new Headers({ ...Object.fromEntries(workspaceHeaders()), allow: "POST" }) });
}
