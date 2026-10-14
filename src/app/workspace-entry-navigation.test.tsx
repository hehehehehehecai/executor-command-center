import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConnectedPanelFixtureAccess } from "@/testing/connected-panels/connected-panel-fixture";
import Home from "./page";
import ProjectGalaxyPage from "./project-galaxy/page";
import FlightLogPage from "./flight-log/page";
import MissionControlPage from "./mission-control/page";
import DecisionArchivePage from "./decision-archive/page";
import CopilotPage from "./copilot/page";

const state = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111" as string | null,
  projects: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "current/private-project" }],
  readFailed: false, ownerOverride: null as string | null,
  calls: [] as { table: string; columns: string; filters: [string, string][] }[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  getAll: () => state.userId ? [{ name: "sb-entry-auth-token", value: "synthetic-transport-only" }] : [],
  get: () => undefined, set: () => undefined,
}) }));
// Only the external SDK transport is synthetic. The server composition,
// WorkspaceContextReader, its three owner checks, pages and navigation are real.
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null }, error: null }) },
  from: (table: string) => ({ select: (columns: string) => {
    const call = { table, columns, filters: [] as [string, string][] }; state.calls.push(call);
    let range: readonly [number, number] | null = null;
    const query = {
      eq: (column: string, value: string) => { call.filters.push([column, value]); return query; },
      order: () => query,
      range: (from: number, to: number) => { range = [from, to]; return query; },
      then: (resolve: (value: unknown) => unknown) => {
        const owner = state.ownerOverride ?? state.userId;
        const data = table === "github_identities" ? [{ user_id: owner, github_login: "current-captain", avatar_url: null }]
          : table === "github_installations" ? [{ user_id: owner, status: "active" }]
          : table === "projects" ? state.projects.map(project => ({ id: project.id, user_id: owner, status: null,
            selected_repositories: { user_id: owner, full_name: project.name, github_installations: { user_id: owner, status: "active" } },
          })) : [];
        return Promise.resolve({ data: range ? data.slice(range[0], range[1] + 1) : data, error: state.readFailed && table === "projects" ? { message: "synthetic_read_failure" } : null }).then(resolve);
      },
    }; return query;
  } }),
}) }));

const alpha = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const beta = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const fixture = resolveConnectedPanelFixtureAccess({ nodeEnvironment: "test", fixtureEnabled: "1", verifiedUserId: "11111111-1111-4111-8111-111111111111", projectId: alpha });
if (fixture.kind !== "authorized") throw new Error("source_fixture_invalid");
const source = fixture.session;
const ports = {
  "project-galaxy": { load: vi.fn(async () => source.projectGalaxy) },
  "flight-log": { load: vi.fn(async () => source.flightLog) },
  "mission-control": { load: vi.fn(async () => source.missionControl) },
  "decision-archive": { load: vi.fn(async () => source.decisionArchive) },
  copilot: { load: vi.fn(async () => source.copilot) },
};
const pages = [
  { id: "project-galaxy", render: (query: Record<string, string | string[]>) => ProjectGalaxyPage({ searchParams: Promise.resolve(query), connectedPort: ports["project-galaxy"] }) },
  { id: "flight-log", render: (query: Record<string, string | string[]>) => FlightLogPage({ searchParams: Promise.resolve(query), connectedPort: ports["flight-log"] }) },
  { id: "mission-control", render: (query: Record<string, string | string[]>) => MissionControlPage({ searchParams: Promise.resolve(query), connectedPort: ports["mission-control"] }) },
  { id: "decision-archive", render: (query: Record<string, string | string[]>) => DecisionArchivePage({ searchParams: Promise.resolve(query), connectedPort: ports["decision-archive"] }) },
  { id: "copilot", render: (query: Record<string, string | string[]>) => CopilotPage({ searchParams: Promise.resolve(query), connectedPort: ports.copilot }) },
];
function markup(element: React.ReactNode) {
  const html = renderToStaticMarkup(element);
  return { html, document: new DOMParser().parseFromString(html, "text/html") };
}
function links(document: Document) { return [...document.querySelectorAll("a")].map(link => link.getAttribute("href")); }
beforeEach(() => {
  state.userId = "11111111-1111-4111-8111-111111111111";
  state.projects = [{ id: alpha, name: "current/private-project" }];
  state.readFailed = false; state.ownerOverride = null; state.calls = [];
  vi.clearAllMocks();
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3017");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://entry-transport.supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
  vi.stubEnv("CONNECTED_PANEL_E2E", undefined);
  vi.stubEnv("WORKSPACE_PREVIEW_E2E", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("T07 actual server pages and owner reader", () => {
  it.each(pages)("T07-P01 $id no-mode anonymous entry preserves its safe login destination", async page => {
    state.userId = null;
    const { html, document } = markup(await page.render({ project: alpha }));
    const login = [...document.querySelectorAll("a")].find(link => link.textContent?.trim() === "使用 GitHub 登录");
    expect(login).toBeDefined();
    const destination = new URL(login!.getAttribute("href")!, "http://127.0.0.1");
    const returnTo = new URL(destination.searchParams.get("returnTo")!, "http://127.0.0.1");
    expect(returnTo.pathname).toBe("/" + page.id);
    expect(returnTo.searchParams.get(page.id === "copilot" ? "projectId" : "project")).toBe(alpha);
    expect(html).not.toMatch(/Aurora Cartography|演示数据 · 完全虚构/);
    expect(state.calls).toHaveLength(0);
  });
  it.each(pages)("T07-P02 $id no projects directs to onboarding without loading a panel", async page => {
    state.projects = [];
    const { html, document } = markup(await page.render({}));
    expect(links(document)).toContain("/onboarding");
    expect(html).not.toMatch(/Aurora Cartography|演示数据 · 完全虚构/);
    for (const port of Object.values(ports)) expect(port.load).not.toHaveBeenCalled();
  });
  it.each(pages)("T07-P03 $id no-mode owned null-background project preserves all cross-panel destinations", async page => {
    const { html, document } = markup(await page.render({}));
    const account = document.querySelector('[aria-label="当前账号"]')!;
    expect([...account.querySelectorAll("a")].find(link => link.textContent === "添加仓库")?.getAttribute("href")).toBe("/onboarding#repositories");
    const navigation = document.querySelector('[aria-label="桌面主导航"]')!;
    expect(navigation).not.toBeNull();
    const destinations = [...navigation.querySelectorAll("a")].map(link => link.getAttribute("href"));
    expect(destinations).toEqual([`/?project=${alpha}`, `/project-galaxy?project=${alpha}`, `/flight-log?project=${alpha}`, `/mission-control?project=${alpha}`, `/decision-archive?project=${alpha}`, `/copilot?projectId=${alpha}`]);
    expect(html).not.toContain("演示数据 · 完全虚构");
    expect(state.calls.filter(call => call.table === "projects").every(call => call.filters.some(([column, value]) => column === "user_id" && value === state.userId))).toBe(true);
    expect(ports[page.id as keyof typeof ports].load).toHaveBeenCalledOnce();
  });
  it.each(pages)("T07-P04 $id formal production cannot enable preview through query or a local flag", async page => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WORKSPACE_PREVIEW_E2E", "1");
    const { html } = markup(await page.render({ mode: "preview" }));
    expect(html).not.toMatch(/演示数据 · 完全虚构|Aurora Cartography/);
    for (const port of Object.values(ports)) expect(port.load).not.toHaveBeenCalled();
  });
  it.each(pages)("T07-P05 $id project read failure is visible and retryable rather than an empty success", async page => {
    state.readFailed = true;
    const { html, document } = markup(await page.render({}));
    expect(html).toContain("暂时无法");
    expect(document.querySelector("main")?.getAttribute("data-ui-state")).toBe("failed");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("原因");
    expect(html).toContain("下一步");
    expect([...document.querySelectorAll("a")].some(link => link.textContent === "重试读取")).toBe(true);
    expect(html).not.toContain("演示数据 · 完全虚构");
    for (const port of Object.values(ports)) expect(port.load).not.toHaveBeenCalled();
  });
  it.each(pages)("T07-P06 $id repeated/conflicting/unknown query does not load a private panel", async page => {
    const queries: Record<string, string | string[]>[] = [{ project: [alpha, alpha] }, { project: alpha, projectId: beta }, { project: alpha, arbitraryProject: beta }];
    for (const query of queries) {
      const { html } = markup(await page.render(query));
      expect(html).toContain('data-ui-state="failed"');
      expect(html).not.toContain("演示数据 · 完全虚构");
      expect(html).not.toContain("Alpha 用户专属项目目标");
    }
    for (const port of Object.values(ports)) expect(port.load).not.toHaveBeenCalled();
  });
  it.each(pages)("T07-P07 $id server-side ownership mismatch is rejected before the panel port", async page => {
    state.ownerOverride = "22222222-2222-4222-8222-222222222222";
    const { html } = markup(await page.render({ project: alpha }));
    expect(html).not.toMatch(/演示数据 · 完全虚构|Alpha 用户专属项目目标/);
    for (const port of Object.values(ports)) expect(port.load).not.toHaveBeenCalled();
  });
  it("T07-P08 actual homepage honors the selected owned project using the real server summary", async () => {
    state.projects.push({ id: beta, name: "current/second-project" });
    const { html, document } = markup(await Home({ searchParams: Promise.resolve({ project: beta }) }));
    expect(html).toContain("current/second-project");
    const entries = document.querySelector('[aria-label="Command Deck 面板入口"]')!;
    expect([...entries.querySelectorAll("a")].every(link => link.getAttribute("href")?.includes(beta))).toBe(true);
    expect(html).not.toContain("演示数据 · 完全虚构");
    expect(state.calls.some(call => call.table === "projects")).toBe(true);
  });
  it("T07-P09 Copilot project alias enters the same owned project and canonicalizes other links", async () => {
    const { document } = markup(await CopilotPage({ searchParams: Promise.resolve({ project: alpha }), connectedPort: ports.copilot }));
    expect(links(document)).toContain(`/flight-log?project=${alpha}`);
    expect(links(document)).toContain(`/copilot?projectId=${alpha}`);
    expect(ports.copilot.load).toHaveBeenCalledOnce();
  });
  it.each(pages)("T07-P10 $id a local connected-fixture flag without its cookie still uses real session entry", async page => {
    vi.stubEnv("CONNECTED_PANEL_E2E", "1");
    state.userId = null;
    const anonymous = markup(await page.render({}));
    expect(anonymous.html).toContain("需要登录");
    expect(anonymous.html).not.toContain("演示数据 · 完全虚构");
    expect(ports[page.id as keyof typeof ports].load).not.toHaveBeenCalled();
    state.userId = "11111111-1111-4111-8111-111111111111";
    const authenticated = markup(await page.render({}));
    expect(links(authenticated.document)).toContain(`/copilot?projectId=${alpha}`);
    expect(ports[page.id as keyof typeof ports].load).toHaveBeenCalledOnce();
    expect(state.calls.some(call => call.table === "projects")).toBe(true);
  });
});
