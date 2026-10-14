import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceContext, WorkspaceProject } from "@/application/workspace/load-workspace-context";
import { resolveOnboardingReturnTarget } from "./onboarding-return-target";
import { OnboardingProjectEntry } from "./onboarding-project-entry";
import { WorkspaceSessionBoundary } from "./workspace-session-boundary";

const a: WorkspaceProject = { id: "62222222-2222-4222-8222-222222222222", name: "synthetic-owner/alpha", status: null };
const b: WorkspaceProject = { id: "63333333-3333-4333-8333-333333333333", name: "synthetic-owner/beta", status: null };
const account: WorkspaceContext = { status: "authenticated", userId: "61111111-1111-4111-8111-111111111111", identity: { status: "ready", data: { login: "synthetic-owner", avatarUrl: null } }, installation: { status: "ready", data: { status: "active" } }, projects: { status: "ready", data: [a, b] } };
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("t06-onboarding-state-regression.v2 context transitions", () => {
  it("[T06-C20] two conflicting owned project parameter aliases cannot silently select one", () => {
    expect(resolveOnboardingReturnTarget(account, `/project-galaxy?mode=connected&project=${a.id}&projectId=${b.id}`)).toEqual({ path: null, rejected: true });
  });
  it("[T06-C21] a refreshed single-project entry uses the current project rather than a stale selection", () => {
    const ui = render(<OnboardingProjectEntry projects={[a]} />);
    ui.rerender(<OnboardingProjectEntry projects={[b]} />);
    expect(screen.getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${b.id}`);
    expect(screen.queryByText(a.name)).not.toBeInTheDocument();
  });
  it("[T06-C22] same-account revalidation preserves a safe onboarding query and explicit repository destination", async () => {
    window.history.replaceState(null, "", `/onboarding?returnTo=${encodeURIComponent(`/project-galaxy?mode=connected&project=${a.id}`)}#repositories`);
    const target = window.location.pathname + window.location.search + window.location.hash;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ workspace: { ...account, projects: { status: "ready", data: [a] } } }));
    const navigate = vi.fn();
    render(<WorkspaceSessionBoundary {...{ workspace: account, fetcher, navigate, preserveOnboardingQuery: true }}><p>old private state</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(target));
    expect(screen.getByText("old private state")).not.toBeVisible();
  });
  it("[T06-C23] an account change removes the previous account return target and hides its content", async () => {
    window.history.replaceState(null, "", `/onboarding?returnTo=${encodeURIComponent(`/project-galaxy?mode=connected&project=${a.id}`)}#repositories`);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ workspace: { ...account, userId: "65555555-5555-4555-8555-555555555555", projects: { status: "ready", data: [] } } }));
    const navigate = vi.fn();
    render(<WorkspaceSessionBoundary {...{ workspace: account, fetcher, navigate, preserveOnboardingQuery: true }}><p>old private state</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/onboarding"));
    expect(screen.getByText("old private state")).not.toBeVisible();
  });
});
