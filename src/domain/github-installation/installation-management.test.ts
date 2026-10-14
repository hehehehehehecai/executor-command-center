import { describe, expect, it } from "vitest";
import { personalInstallationManagementUrl } from "./installation-management";

describe("个人安装管理地址绑定", () => {
  it("仅接受官方响应内当前个人安装的完整地址", () => {
    expect(personalInstallationManagementUrl("https://github.com/settings/installations/81001", 81001)).toBe("https://github.com/settings/installations/81001");
  });
  it.each([
    undefined, null, "", " https://github.com/settings/installations/81001", "http://github.com/settings/installations/81001",
    "//github.com/settings/installations/81001", "https://github.com.evil.test/settings/installations/81001",
    "https://evil.github.com/settings/installations/81001", "https://user@github.com/settings/installations/81001",
    "https://github.com:443/settings/installations/81001", "https://github.com:444/settings/installations/81001",
    "https://github.com/settings/installations/81002", "https://github.com/settings/installations/081001",
    "https://github.com/settings/installations/81001/", "https://github.com/settings/installations/81001?next=https://evil.test",
    "https://github.com/settings/installations/81001#x", "https://github.com/organizations/x/settings/installations/81001",
    "https://github.com/settings/installations/%38%31%30%30%31", "https://github.com/a/../settings/installations/81001",
    "https://github.com\\settings\\installations\\81001", 81001,
  ])("拒绝缺失或恶意地址 %#", value => {
    expect(() => personalInstallationManagementUrl(value, 81001)).toThrow("installation_management_address_unavailable");
  });
});
