import { describe, expect, it } from "vitest";

import type { UserIdentityInput } from "@/application/auth/user-identity-input";
import { SupabaseIdentityRpcClient } from "./supabase-identity-rpc-client";

const input: UserIdentityInput = {
  authUserId: "11111111-1111-4111-8111-111111111111",
  githubUserId: 123456789,
  githubLogin: "executor-user",
  avatarUrl: null,
};

describe("SupabaseIdentityRpcClient", () => {
  it("calls only the narrow identity RPC with service-role headers", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (requestInput, init) => {
      requests.push({ input: requestInput, init });
      return new Response(JSON.stringify(input.authUserId), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = new SupabaseIdentityRpcClient({
      supabaseUrl: "http://127.0.0.1:54321/",
      serviceRoleKey: "local-test-service-role",
      fetcher,
    });

    await expect(client.ensureUserIdentity(input)).resolves.toEqual({
      data: input.authUserId,
      error: null,
    });
    expect(requests).toHaveLength(1);
    expect(String(requests[0]?.input)).toBe(
      "http://127.0.0.1:54321/rest/v1/rpc/ensure_user_identity",
    );
    expect(requests[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        apikey: "local-test-service-role",
        authorization: "Bearer local-test-service-role",
        "content-type": "application/json",
      },
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      p_auth_user_id: input.authUserId,
      p_github_user_id: input.githubUserId,
      p_github_login: input.githubLogin,
      p_avatar_url: null,
    });
  });

  it("returns only the stable PostgREST code and message on failure", async () => {
    const client = new SupabaseIdentityRpcClient({
      supabaseUrl: "http://127.0.0.1:54321",
      serviceRoleKey: "local-test-service-role",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            code: "P0001",
            message: "identity_github_user_conflict",
            details: "sensitive detail",
            hint: "sensitive hint",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
    });

    await expect(client.ensureUserIdentity(input)).resolves.toEqual({
      data: null,
      error: { code: "P0001", message: "identity_github_user_conflict" },
    });
  });

  it("maps non-JSON failures without exposing response text", async () => {
    const client = new SupabaseIdentityRpcClient({
      supabaseUrl: "http://127.0.0.1:54321",
      serviceRoleKey: "local-test-service-role",
      fetcher: async () => new Response("gateway detail", { status: 502 }),
    });

    await expect(client.ensureUserIdentity(input)).resolves.toEqual({
      data: null,
      error: { message: "identity_rpc_failed" },
    });
  });
});
