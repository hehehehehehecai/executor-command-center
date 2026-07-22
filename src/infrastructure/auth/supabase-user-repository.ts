import {
  AuthUserNotFoundError,
  UserIdentityConflictError,
  UserIdentityPersistenceError,
} from "@/application/auth/user-identity-errors";
import {
  type UserIdentityInput,
  validateUserIdentityInput,
} from "@/application/auth/user-identity-input";
import type { UserRepository } from "@/application/auth/user-repository";

export type UserIdentityRpcError = {
  readonly code?: string;
  readonly message: string;
};

export type UserIdentityRpcResult = {
  readonly data: string | null;
  readonly error: UserIdentityRpcError | null;
};

export interface UserIdentityRpcClient {
  ensureUserIdentity(input: UserIdentityInput): Promise<UserIdentityRpcResult>;
}

function mapPersistenceError(error: UserIdentityRpcError): Error {
  if (error.message === "auth_user_not_found") {
    return new AuthUserNotFoundError();
  }

  if (error.message === "identity_github_user_conflict") {
    return new UserIdentityConflictError("github_user_already_bound");
  }

  if (error.message === "identity_auth_user_conflict") {
    return new UserIdentityConflictError("auth_user_already_bound");
  }

  return new UserIdentityPersistenceError();
}

export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly rpcClient: UserIdentityRpcClient) {}

  async ensureForAuthUser(
    input: UserIdentityInput,
  ): Promise<{ userId: string }> {
    const normalizedInput = validateUserIdentityInput(input);
    const result = await this.rpcClient.ensureUserIdentity(normalizedInput);

    if (result.error) {
      throw mapPersistenceError(result.error);
    }

    if (result.data === null) {
      throw new UserIdentityPersistenceError();
    }

    return { userId: result.data };
  }
}
