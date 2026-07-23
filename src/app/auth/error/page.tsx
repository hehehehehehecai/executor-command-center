import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="auth-status-shell">
      <p className="section-kicker">GitHub identity</p>
      <h1>登录未完成</h1>
      <p>身份登录未能安全完成。请返回后重试。</p>
      <Link href="/">返回 EXECUTOR</Link>
    </main>
  );
}
