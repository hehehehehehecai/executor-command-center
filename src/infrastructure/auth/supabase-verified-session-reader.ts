import type { VerifiedSessionReader } from "@/application/github-installation/start-github-installation";

type VerifiedUserClient = {
  readonly auth: {
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
    getSession?: () => unknown;
  };
};

export class SupabaseVerifiedSessionReader implements VerifiedSessionReader {
  constructor(private readonly client: VerifiedUserClient) {}

  async getVerifiedUserId() {
    const { data, error } = await this.client.auth.getUser();

    if (error || !data.user?.id) {
      return null;
    }

    return data.user.id;
  }
}
