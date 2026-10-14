import type { InstallationManagementView } from "@/application/github-installation/load-installation-management";
import { personalInstallationManagementUrl } from "@/domain/github-installation/installation-management";

const failures: Record<string, readonly [number, string]> = {
  unauthenticated: [401, "登录已失效，请重新登录。"],
  installation_management_invalid_request: [400, "请求参数无效，请从产品入口重试。"],
  installation_management_cross_site: [403, "请从产品页面打开授权管理。"],
  installation_account_mismatch: [403, "无法确认当前账号的安装归属。"],
  installation_id_mismatch: [403, "无法确认当前账号的安装归属。"],
  installation_app_mismatch: [403, "无法确认当前应用的安装归属。"],
  unsupported_installation_account_type: [409, "当前仅支持个人 GitHub 安装，暂不支持组织安装。"],
  installation_context_changed: [409, "安装状态已变化，请重新刷新。"],
  installation_context_read_failed: [503, "安装状态读取失败，请稍后重试。"],
  installation_management_address_unavailable: [502, "暂时无法安全打开管理地址，请稍后重试。"],
  installation_management_not_registered: [409, "请先安装或重新确认 GitHub App。"],
  github_app_configuration_missing: [503, "GitHub App 配置暂不可用，请稍后重试。"],
  github_app_authentication_failed: [503, "GitHub App 配置暂不可用，请稍后重试。"],
  github_api_forbidden: [502, "GitHub 暂不允许读取安装，请稍后重试。"],
  github_api_rate_limited: [429, "GitHub 请求频率受限，请稍后重试。"],
  github_api_timeout: [504, "GitHub 响应超时，请重试。"],
  github_api_invalid_response: [502, "GitHub 返回的安装信息不可用，请重试。"],
  github_api_unavailable: [502, "GitHub 暂时不可用，请重试。"],
  installation_management_failed: [503, "安装状态暂时不可用，请重试。"],
};
export async function handleInstallationManagement(input: {
  readonly request: Request; readonly operation: "current" | "manage"; readonly trustedOrigin?: string;
  readonly execute: () => Promise<InstallationManagementView>;
}): Promise<Response> {
  const headers = new Headers({ "cache-control": "private, no-store", vary: "Cookie, Origin" });
  if (input.request.method !== "GET") { headers.set("allow", "GET"); return new Response(null, { status: 405, headers }); }
  try {
    const url = new URL(input.request.url);
    if (url.search || (input.request.headers.get("content-length") ?? "0") !== "0") throw new Error("installation_management_invalid_request");
    if (!input.trustedOrigin || new URL(input.trustedOrigin).origin !== input.trustedOrigin) throw new Error("github_app_configuration_missing");
    const origin = input.request.headers.get("origin");
    if ((origin !== null && origin !== input.trustedOrigin) || input.request.headers.get("sec-fetch-site") === "cross-site") throw new Error("installation_management_cross_site");
    const result = await input.execute();
    if (input.operation === "manage") {
      if (result.status === "not_registered" || result.status === "revoked") throw new Error("installation_management_not_registered");
      const address = result.managementUrl;
      const id = typeof address === "string" ? Number(address.split("/").at(-1)) : NaN;
      headers.set("location", personalInstallationManagementUrl(address, id));
      return new Response(null, { status: 303, headers });
    }
    return Response.json({ version: result.version, subjectId: result.subjectId, status: result.status, canSelectRepositories: result.canSelectRepositories, reconnectRequired: result.reconnectRequired, managementUrl: result.managementUrl, managementError: result.managementError }, { headers });
  } catch (error) {
    const code = error instanceof Error && Object.hasOwn(failures, error.message) ? error.message : "installation_management_failed";
    const [status, message] = failures[code]!;
    if (input.operation === "manage") {
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>授权管理</title><main><h1>暂时无法打开授权管理</h1><p>${message}</p><a href="/onboarding">返回产品，刷新后重试</a></main></html>`, { status, headers });
    }
    return Response.json({ error: { code, message } }, { status, headers });
  }
}
