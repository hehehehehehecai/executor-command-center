import type { UserIdentityInput } from "@/application/auth/user-identity-input";
import type {
  UserIdentityRpcClient,
  UserIdentityRpcError,
  UserIdentityRpcResult,
} from "./supabase-user-repository";

type SupabaseIdentityRpcClientOptions = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

function parseRpcError(value: unknown): UserIdentityRpcError {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    const code = "code" in value ? value.code : undefined;

    return {
      ...(typeof code === "string" ? { code } : {}),
      message: value.message,
    };
  }

  return { message: "identity_rpc_failed" };
}

export class SupabaseIdentityRpcClient implements UserIdentityRpcClient {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: SupabaseIdentityRpcClientOptions) {
    this.endpoint = new URL(
      "rest/v1/rpc/ensure_user_identity",
      `${options.supabaseUrl.replace(/\/+$/, "")}/`,
    ).toString();
    this.fetcher = options.fetcher ?? fetch;
  }

  async ensureUserIdentity(
    input: UserIdentityInput,
  ): Promise<UserIdentityRpcResult> {
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        apikey: this.options.serviceRoleKey,
        authorization: `Bearer ${this.options.serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_auth_user_id: input.authUserId,
        p_github_user_id: input.githubUserId,
        p_github_login: input.githubLogin,
        p_avatar_url: input.avatarUrl,
      }),
    });

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      return { data: null, error: parseRpcError(payload) };
    }

    return {
      data: typeof payload === "string" ? payload : null,
      error: null,
    };
  }
}
