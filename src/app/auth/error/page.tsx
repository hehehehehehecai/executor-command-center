import { AccessibleStatusShell } from "@/shared/status-shell/AccessibleStatusShell";

export default function AuthErrorPage() {
  return (
    <AccessibleStatusShell
      kicker="GitHub identity"
      title="登录未完成"
      state="failed"
      reason="身份登录未能安全完成。"
      nextStep="返回 Command Deck 后重新发起 GitHub 登录。"
    />
  );
}
