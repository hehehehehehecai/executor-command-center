import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

function unavailable() {
  return new Response(null, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.PHASE5_E2E !== "1") {
    return unavailable();
  }

  const environment = parseServerEnvironment(process.env);
  if (
    !environment.APP_ORIGIN ||
    request.headers.get("origin") !== environment.APP_ORIGIN ||
    !process.env.PHASE5_E2E_CONTROL_TOKEN ||
    request.headers.get("x-phase5-e2e-control-token") !==
      process.env.PHASE5_E2E_CONTROL_TOKEN
  ) {
    return unavailable();
  }

  let credentials: { email?: unknown; password?: unknown };
  try {
    credentials = (await request.json()) as typeof credentials;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof credentials.email !== "string" || typeof credentials.password !== "string") {
    return new Response(null, { status: 400 });
  }

  const responseHeaders = new Headers();
  const client = createSupabaseServerClient({
    environment,
    cookieStore: await cookies(),
    responseHeaders,
  });
  const { error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error) return new Response(null, { status: 401 });

  const response = Response.json({ ok: true });
  responseHeaders.forEach((value, name) => response.headers.set(name, value));
  return response;
}
