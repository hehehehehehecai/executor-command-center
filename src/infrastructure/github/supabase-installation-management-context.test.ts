import { describe, expect, it, vi } from "vitest";
import { SupabaseInstallationManagementContext } from "./supabase-installation-management-context";
const userId="11111111-1111-4111-8111-111111111111";
const identity={user_id:userId,github_user_id:71001};
const installation={id:"22222222-2222-4222-8222-222222222222",user_id:userId,installation_id:81001,github_account_id:71001,status:"active",last_verified_at:"2026-09-28T00:00:00Z",revoked_at:null,suspended_at:null};
function reader(identities:unknown=[identity],installations:unknown=[installation],error:unknown=null){const eq=vi.fn();const client={from:vi.fn((table:string)=>({select:vi.fn(()=>({eq:(column:string,value:string)=>{eq(column,value);return Promise.resolve({data:table==="github_identities"?identities:installations,error});}}))}))};return {eq,client,read:()=>new SupabaseInstallationManagementContext(client).read(userId)};}
describe("会话RLS下本人安装读取",()=>{
 it("仅按verified主体读取身份及安装并返回变更指纹",async()=>{const f=reader();expect(await f.read()).toMatchObject({accountId:71001,installation:{installationId:81001,status:"active",revision:expect.any(String)}});expect(f.eq.mock.calls).toEqual([["user_id",userId],["user_id",userId]]);});
 it("真空安装为未登记",async()=>{expect(await reader([identity],[]).read()).toEqual({accountId:71001,installation:null});});
 it.each([[[],[installation]],[[{...identity,user_id:"33333333-3333-4333-8333-333333333333"}],[installation]],[[identity],[{...installation,user_id:"33333333-3333-4333-8333-333333333333"}]],[[identity],[{...installation,github_account_id:71002}]],[[identity],[installation,installation]],[[identity],null]])("拒绝错归属或不完整响应 %#",async(identities,installations)=>{await expect(reader(identities,installations).read()).rejects.toThrow("installation_context_read_failed");});
 it("上游读取错误不是空安装",async()=>{await expect(reader([identity],[],{message:"private"}).read()).rejects.toThrow("installation_context_read_failed");});
});
