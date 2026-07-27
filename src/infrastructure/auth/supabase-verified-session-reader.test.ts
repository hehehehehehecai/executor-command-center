import { describe, expect, it, vi } from "vitest";

import { SupabaseVerifiedSessionReader } from "./supabase-verified-session-reader";

describe("GitHub installation session boundary", () => {
  it("uses getUser to revalidate and returns the authenticated user id", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    const getSession = vi.fn();
    const reader = new SupabaseVerifiedSessionReader({
      auth: { getUser, getSession },
    });

    await expect(reader.getVerifiedUserId()).resolves.toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: null }, error: { message: "invalid token" } },
    {
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: { message: "untrusted session" },
    },
  ])("returns null for an unverified session", async (result) => {
    const reader = new SupabaseVerifiedSessionReader({
      auth: { getUser: vi.fn().mockResolvedValue(result) },
    });

    await expect(reader.getVerifiedUserId()).resolves.toBeNull();
  });
});
