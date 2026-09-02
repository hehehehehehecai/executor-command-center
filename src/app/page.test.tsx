import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAll: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: mocks.getAll, set: vi.fn() })),
}));

vi.mock("@/infrastructure/auth/supabase-server-client", () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/shared/configuration/server-environment", () => ({
  parseServerEnvironment: vi.fn(() => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon",
  })),
}));

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAll.mockReturnValue([]);
  });

  afterEach(cleanup);

  it("renders the EXECUTOR brand heading and tagline", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(await Home());

    expect(
      screen.getByRole("heading", { level: 1, name: "EXECUTOR" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Command Your Projects")).toBeInTheDocument();
  });

  it("renders an authenticated identity state instead of the login primary action", async () => {
    mocks.getAll.mockReturnValue([
      { name: "sb-fixture-auth-token", value: "fixture-only" },
    ]);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });

    render(await Home());

    expect(screen.getByText("GitHub 身份已登录")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "使用 GitHub 登录" }))
      .not.toBeInTheDocument();
  });

  it("keeps the login action when no Supabase session cookie exists", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });

    render(await Home());

    expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toBeInTheDocument();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
