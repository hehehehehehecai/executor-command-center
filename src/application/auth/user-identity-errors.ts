export type UserIdentityConflictCode =
  | "auth_user_already_bound"
  | "github_user_already_bound";

export class UserIdentityConflictError extends Error {
  readonly name = "UserIdentityConflictError";

  constructor(readonly code: UserIdentityConflictCode) {
    super(code);
  }
}

export class AuthUserNotFoundError extends Error {
  readonly name = "AuthUserNotFoundError";
  readonly code = "auth_user_not_found";

  constructor() {
    super("auth_user_not_found");
  }
}

export class UserIdentityPersistenceError extends Error {
  readonly name = "UserIdentityPersistenceError";
  readonly code = "identity_persistence_failed";

  constructor() {
    super("identity_persistence_failed");
  }
}
