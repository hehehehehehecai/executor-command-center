import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import ProjectGalaxyPage from "./project-galaxy/page";
import FlightLogPage from "./flight-log/page";
import MissionControlPage from "./mission-control/page";
import DecisionArchivePage from "./decision-archive/page";
import CopilotPage from "./copilot/page";

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }) }));

const pages = [
  { id: "home", render: (mode?: string) => Home({ searchParams: Promise.resolve(mode ? { mode } : {}) }) },
  { id: "project-galaxy", render: (mode?: string) => ProjectGalaxyPage({ searchParams: Promise.resolve(mode ? { mode } : {}) }) },
  { id: "flight-log", render: (mode?: string) => FlightLogPage({ searchParams: Promise.resolve(mode ? { mode } : {}) }) },
  { id: "mission-control", render: (mode?: string) => MissionControlPage({ searchParams: Promise.resolve(mode ? { mode } : {}) }) },
  { id: "decision-archive", render: (mode?: string) => DecisionArchivePage({ searchParams: Promise.resolve(mode ? { mode } : {}) }) },
  { id: "copilot", render: (mode?: string) => CopilotPage({ searchParams: Promise.resolve(mode ? { mode } : {}) }) },
];

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3017");
  vi.stubEnv("WORKSPACE_PREVIEW_E2E", "1");
  vi.stubEnv("CONNECTED_PANEL_E2E", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("T07.1 actual controlled preview and formal identity boundary", () => {
  it.each(pages)("T07.1-C01 $id explicit local preview retains its disclosed presentation without an unavailable formal account", async page => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(await page.render("preview"));
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(html).toContain("演示数据");
    expect(html).toContain("完全虚构");
    expect(document.querySelector('[aria-label="当前账号"]')).toBeNull();
    expect(html).not.toContain("账号服务尚未配置");
    if (page.id === "home") {
      const login = document.querySelector('[aria-label="GitHub 身份登录"]');
      expect(login?.textContent).toContain("登录仅用于确认身份，不授予仓库权限。");
      expect(login?.querySelector("a")?.getAttribute("href")).toBe("/api/auth/github?returnTo=%2Fonboarding");
    } else {
      expect(document.querySelector('[data-panel-mode="preview"]')).not.toBeNull();
      const back = [...document.querySelectorAll("a")].find(link => link.textContent === "返回 Command Deck");
      expect(back?.getAttribute("href")).toBe("/?mode=preview");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(pages)("T07.1-C02 $id production with the local flag still refuses explicit preview", async page => {
    vi.stubEnv("NODE_ENV", "production");
    const fetcher = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(await page.render("preview"));
    expect(html).not.toContain('data-panel-mode="preview"');
    expect(html).not.toContain("完全虚构");
    expect(html).toContain("账号服务尚未配置");
    expect(html).toContain('role="alert"');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(pages)("T07.1-C03 $id no-mode read failure keeps the formal account error and never consumes preview", async page => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(await page.render());
    expect(html).toContain("账号服务尚未配置");
    expect(html).toContain('aria-label="当前账号"');
    expect(html).not.toContain("完全虚构");
    expect(html).not.toContain('data-panel-mode="preview"');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
