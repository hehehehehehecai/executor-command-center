import type { GitHubAppInstallationReader, GitHubInstallationStatus } from "@/domain/github-installation/github-app-installation";
import { personalInstallationManagementUrl } from "@/domain/github-installation/installation-management";

export interface InstallationManagementContext {
  readonly accountId: number;
  readonly installation: { readonly installationId: number; readonly status: GitHubInstallationStatus; readonly revision: string } | null;
}
export interface InstallationManagementContextReader { read(userId: string): Promise<InstallationManagementContext> }
export interface InstallationManagementView {
  readonly version: "github-installation-management.v1";
  readonly subjectId: string;
  readonly status: GitHubInstallationStatus | "not_registered";
  readonly canSelectRepositories: boolean;
  readonly reconnectRequired: boolean;
  readonly managementUrl: string | null;
  readonly managementError: "installation_management_address_unavailable" | null;
}
export class LoadInstallationManagement {
  constructor(private readonly dependencies: {
    readonly sessionReader: { getVerifiedUserId(): Promise<string | null> };
    readonly contextReader: InstallationManagementContextReader;
    readonly installationReader: GitHubAppInstallationReader;
    readonly configuredAppId: string;
  }) {}

  async execute(): Promise<InstallationManagementView> {
    const userId = await this.dependencies.sessionReader.getVerifiedUserId();
    if (!userId) throw new Error("unauthenticated");
    const context = await this.dependencies.contextReader.read(userId);
    const base = { version: "github-installation-management.v1", subjectId: userId, canSelectRepositories: false, reconnectRequired: false, managementUrl: null, managementError: null } as const;
    if (!context.installation) return { ...base, status: "not_registered" };
    const appId = Number(this.dependencies.configuredAppId);
    if (!/^[1-9]\d*$/.test(this.dependencies.configuredAppId) || !Number.isSafeInteger(appId)) throw new Error("github_app_configuration_missing");
    let snapshot;
    try { snapshot = await this.dependencies.installationReader.getInstallation(context.installation.installationId); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "github_installation_not_found") throw error;
      snapshot = null;
    }
    const latest = await this.dependencies.contextReader.read(userId);
    if (latest.accountId !== context.accountId || !latest.installation
      || latest.installation.installationId !== context.installation.installationId
      || latest.installation.status !== context.installation.status
      || latest.installation.revision !== context.installation.revision) throw new Error("installation_context_changed");
    if (!snapshot) return { ...base, status: "revoked" };
    if (snapshot.installationId !== context.installation.installationId) throw new Error("installation_id_mismatch");
    if (snapshot.appId !== appId) throw new Error("installation_app_mismatch");
    if (snapshot.accountType !== "User") throw new Error("unsupported_installation_account_type");
    if (snapshot.accountId !== context.accountId) throw new Error("installation_account_mismatch");
    const status = snapshot.suspendedAt === null ? "active" : "suspended";
    let managementUrl: string | null = null;
    let managementError: InstallationManagementView["managementError"] = null;
    try { managementUrl = personalInstallationManagementUrl(snapshot.managementUrl, context.installation.installationId); }
    catch { managementError = "installation_management_address_unavailable"; }
    return { ...base, status, canSelectRepositories: status === "active" && context.installation.status === "active", reconnectRequired: status === "active" && context.installation.status !== "active", managementUrl, managementError };
  }
}
