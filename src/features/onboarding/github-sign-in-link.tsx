export function GitHubSignInLink() {
  return (
    <aside className="auth-entry" aria-label="GitHub 身份登录">
      <a
        className="auth-entry-link"
        href="/api/auth/github?returnTo=%2Fonboarding"
      >
        使用 GitHub 登录
      </a>
      <p>登录仅用于确认身份，不授予仓库权限。</p>
    </aside>
  );
}
