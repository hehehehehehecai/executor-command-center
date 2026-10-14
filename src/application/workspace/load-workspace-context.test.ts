import { describe, expect, it, vi } from "vitest";
import { loadWorkspaceContext, type WorkspaceContextReader, type WorkspaceProject } from "./load-workspace-context";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
function reader(userId = A) {
  return {
    verifySession: vi.fn(async () => ({ status: "verified" as const, user: { id: userId, identities: [{ provider: "github", id: "701", identity_data: { user_name: "account-a", avatar_url: "https://avatars.githubusercontent.com/u/701" } }] } })),
    readIdentity: vi.fn(async () => ({ login: "stored-account", avatarUrl: null })),
    readInstallation: vi.fn(async () => ({ status: "active" as const })),
    readProjects: vi.fn(async (): Promise<WorkspaceProject[]> => [{ id: "project-a", name: "A/own", status: "in_planning" }]),
  };
}
describe("工作区视图：合成账号A/B", () => {
  it("W06 distinguishes missing configuration", async () => {
    expect(await loadWorkspaceContext(null)).toEqual({ status: "unavailable", reason: "configuration_missing" });
  });
  it.each(["missing_session", "invalid_session"] as const)("W01/W04 %s does not read account data", async (reason) => {
    const port = reader();
    port.verifySession = vi.fn(async () => ({ status: "signed_out", reason })) as unknown as typeof port.verifySession;
    expect(await loadWorkspaceContext(port)).toEqual({ status: "signed_out", reason });
    expect(port.readProjects).not.toHaveBeenCalled();
    expect(port.readInstallation).not.toHaveBeenCalled();
  });
  it("W05 verification failure never becomes signed out", async () => {
    const port = reader(); port.verifySession.mockRejectedValue(new Error("token=private"));
    expect(await loadWorkspaceContext(port)).toEqual({ status: "unavailable", reason: "verification_failed" });
    expect(port.readProjects).not.toHaveBeenCalled();
  });
  it("W02 verified account with zero projects retains identity", async () => {
    const port = reader(); port.readProjects.mockResolvedValue([]);
    expect(await loadWorkspaceContext(port)).toMatchObject({ status: "authenticated", userId: A, identity: { status: "ready", data: { login: "account-a" } }, projects: { status: "ready", data: [] } });
    expect(port.readProjects).toHaveBeenCalledWith(A);
    expect(port.readIdentity).not.toHaveBeenCalled();
  });
  it("W03/W10 display fields cannot change verified account ownership", async () => {
    const port = reader(B);
    const projects: WorkspaceProject[] = [{ id: "project-b1", name: "B/one", status: "in_planning" }, { id: "project-b2", name: "B/two", status: "archived" }];
    port.readProjects.mockResolvedValue(projects);
    expect(await loadWorkspaceContext(port)).toMatchObject({ userId: B, identity: { data: { login: "account-a" } }, projects: { status: "ready", data: projects } });
    expect(port.readInstallation).toHaveBeenCalledWith(B);
    expect(port.readProjects).toHaveBeenCalledWith(B);
  });
  it("W07 uses existing stored identity when provider display fields are absent", async () => {
    const port: WorkspaceContextReader = { ...reader(), verifySession: async () => ({ status: "verified", user: { id: A } }) };
    expect(await loadWorkspaceContext(port)).toMatchObject({ status: "authenticated", identity: { status: "ready", data: { login: "stored-account" } } });
  });
  it("W07 profile failure leaves valid session and projects intact without serializing errors", async () => {
    const port = { ...reader(), verifySession: async () => ({ status: "verified" as const, user: { id: A } }) };
    port.readIdentity.mockRejectedValue(new Error("private credentials"));
    const result = await loadWorkspaceContext(port);
    expect(result).toMatchObject({ status: "authenticated", identity: { status: "failed" }, projects: { status: "ready" } });
    expect(JSON.stringify(result)).not.toContain("private credentials");
  });
  it("W08 unknown installation blocks project disclosure", async () => {
    const port = reader(); port.readInstallation.mockRejectedValue(new Error("private"));
    expect(await loadWorkspaceContext(port)).toMatchObject({ status: "authenticated", installation: { status: "failed" }, projects: { status: "blocked" } });
    expect(port.readProjects).not.toHaveBeenCalled();
  });
  it.each(["suspended", "revoked"] as const)("W11 %s installation blocks project disclosure", async (status) => {
    const port = { ...reader(), readInstallation: vi.fn(async () => ({ status })) };
    expect(await loadWorkspaceContext(port)).toMatchObject({ status: "authenticated", installation: { status: "ready", data: { status } }, projects: { status: "blocked" } });
    expect(port.readProjects).not.toHaveBeenCalled();
  });
  it("W09 project failure is distinct from a true empty list", async () => {
    const port = reader(); port.readProjects.mockRejectedValue(new Error("sql secret"));
    expect(await loadWorkspaceContext(port)).toMatchObject({ status: "authenticated", projects: { status: "failed" } });
  });
});
