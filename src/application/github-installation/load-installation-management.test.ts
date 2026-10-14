import { describe, expect, it, vi } from "vitest";
import { LoadInstallationManagement } from "./load-installation-management";

const userId="11111111-1111-4111-8111-111111111111";
const context={accountId:71001, installation:{installationId:81001,status:"active" as const,revision:"one"}};
const snapshot={installationId:81001,appId:900001,accountId:71001,accountLogin:"synthetic",accountType:"User",repositorySelection:"selected" as const,suspendedAt:null as string|null,managementUrl:"https://github.com/settings/installations/81001"};
function setup() {
  const sessionReader={getVerifiedUserId:vi.fn().mockResolvedValue(userId)};
  const contextReader={read:vi.fn().mockResolvedValue(context)};
  const installationReader={getInstallation:vi.fn().mockResolvedValue(snapshot)};
  return {sessionReader,contextReader,installationReader,run:()=>new LoadInstallationManagement({sessionReader,contextReader,installationReader,configuredAppId:"900001"}).execute()};
}
describe("本人安装实时只读核验",()=>{
 it("验证主体、官方快照与二次读取后提供本人管理地址",async()=>{const f=setup();expect(await f.run()).toEqual({version:"github-installation-management.v1",subjectId:userId,status:"active",canSelectRepositories:true,reconnectRequired:false,managementUrl:snapshot.managementUrl,managementError:null});expect(f.contextReader.read.mock.calls).toEqual([[userId],[userId]]);expect(f.installationReader.getInstallation).toHaveBeenCalledWith(81001);});
 it("没有会话不读取安装",async()=>{const f=setup();f.sessionReader.getVerifiedUserId.mockResolvedValue(null);await expect(f.run()).rejects.toThrow("unauthenticated");expect(f.contextReader.read).not.toHaveBeenCalled();});
 it("未登记与远端失败不同",async()=>{const f=setup();f.contextReader.read.mockResolvedValue({accountId:71001,installation:null});expect(await f.run()).toMatchObject({status:"not_registered",canSelectRepositories:false,managementUrl:null});expect(f.installationReader.getInstallation).not.toHaveBeenCalled();});
 it.each([["installationId",81002,"installation_id_mismatch"],["appId",900002,"installation_app_mismatch"],["accountId",71002,"installation_account_mismatch"],["accountType","Organization","unsupported_installation_account_type"]])("拒绝错配 %s",async(key,value,code)=>{const f=setup();f.installationReader.getInstallation.mockResolvedValue({...snapshot,[String(key)]:value});await expect(f.run()).rejects.toThrow(String(code));});
 it("上游404明确撤销而非空列表",async()=>{const f=setup();f.installationReader.getInstallation.mockRejectedValue(new Error("github_installation_not_found"));expect(await f.run()).toMatchObject({status:"revoked",canSelectRepositories:false,managementUrl:null});});
 it.each(["github_api_forbidden","github_api_rate_limited","github_api_timeout","github_api_invalid_response","github_api_unavailable"])("保留可安全分类的 %s",async(code)=>{const f=setup();f.installationReader.getInstallation.mockRejectedValue(new Error(code));await expect(f.run()).rejects.toThrow(code);});
 it("远端暂停不能继续旧active选择",async()=>{const f=setup();f.installationReader.getInstallation.mockResolvedValue({...snapshot,suspendedAt:"2026-09-28T00:00:00Z"});expect(await f.run()).toMatchObject({status:"suspended",canSelectRepositories:false});});
 it.each(["suspended","revoked"])("本地%s不得由普通查询恢复权限",async(status)=>{const f=setup();f.contextReader.read.mockResolvedValue({...context,installation:{...context.installation,status}});expect(await f.run()).toMatchObject({status:"active",canSelectRepositories:false,reconnectRequired:true});});
 it("核验期间安装改变则丢弃旧成功",async()=>{const f=setup();f.contextReader.read.mockResolvedValueOnce(context).mockResolvedValueOnce({...context,installation:{...context.installation,revision:"changed"}});await expect(f.run()).rejects.toThrow("installation_context_changed");});
 it("核验期间账号身份改变则丢弃旧成功",async()=>{const f=setup();f.contextReader.read.mockResolvedValueOnce(context).mockResolvedValueOnce({...context,accountId:71002});await expect(f.run()).rejects.toThrow("installation_context_changed");});
 it("缺少管理地址不破坏旧注册形状，也不猜地址",async()=>{const f=setup();f.installationReader.getInstallation.mockResolvedValue({...snapshot,managementUrl:undefined});expect(await f.run()).toMatchObject({status:"active",managementUrl:null,managementError:"installation_management_address_unavailable"});});
});
