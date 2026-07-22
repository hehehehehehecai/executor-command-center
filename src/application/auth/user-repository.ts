import type { UserIdentityInput } from "./user-identity-input";

export interface UserRepository {
  ensureForAuthUser(input: UserIdentityInput): Promise<{ userId: string }>;
}
