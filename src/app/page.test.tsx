import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAll: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
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
import RootLayout from "./layout";

describe("根布局的主题属性", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    { label: "缺省主题", value: undefined, expected: "deep-space" },
    { label: "显式深空主题", value: "deep-space", expected: "deep-space" },
    { label: "legacy 回退", value: "legacy", expected: "legacy" },
    { label: "未知主题回退", value: " DEEP-SPACE ", expected: "legacy" },
  ])("将$label写入真实 html 根节点并保留子内容", async ({ value, expected }) => {
    vi.stubEnv("NEXT_PUBLIC_EXECUTOR_THEME", value);
    const markup = renderToStaticMarkup(
      await RootLayout({ children: <main id="main-content">主题测试内容</main> }),
    );
    const document = new DOMParser().parseFromString(markup, "text/html");

    expect(document.documentElement.getAttribute("data-executor-theme")).toBe(expected);
    expect(document.documentElement.getAttribute("lang")).toBe("zh-CN");
    expect(document.querySelector("main")?.textContent).toBe("主题测试内容");
    expect(document.querySelector(".skip-link")?.getAttribute("href")).toBe("#main-content");
  });
});

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
