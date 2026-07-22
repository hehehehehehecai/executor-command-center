export const githubLoginMaxLength = 255;
export const avatarUrlMaxLength = 2048;

export type UserIdentityInput = {
  readonly authUserId: string;
  readonly githubUserId: number;
  readonly githubLogin: string;
  readonly avatarUrl: string | null;
};

export type IdentityInputErrorCode =
  | "invalid_auth_user_id"
  | "invalid_avatar_url"
  | "invalid_github_login"
  | "invalid_github_user_id";

export class IdentityInputError extends Error {
  readonly name = "IdentityInputError";

  constructor(readonly code: IdentityInputErrorCode) {
    super(code);
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidAvatarUrl(value: string) {
  if (value.length > avatarUrlMaxLength) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateUserIdentityInput(
  input: UserIdentityInput,
): UserIdentityInput {
  if (!uuidPattern.test(input.authUserId)) {
    throw new IdentityInputError("invalid_auth_user_id");
  }

  if (!Number.isSafeInteger(input.githubUserId) || input.githubUserId <= 0) {
    throw new IdentityInputError("invalid_github_user_id");
  }

  const githubLogin = input.githubLogin.trim();

  if (githubLogin === "" || githubLogin.length > githubLoginMaxLength) {
    throw new IdentityInputError("invalid_github_login");
  }

  if (input.avatarUrl !== null && !isValidAvatarUrl(input.avatarUrl)) {
    throw new IdentityInputError("invalid_avatar_url");
  }

  return { ...input, githubLogin };
}
