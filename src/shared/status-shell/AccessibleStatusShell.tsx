import Link from "next/link";

export type AccessibleUiState =
  | "loading"
  | "empty"
  | "stale"
  | "partial"
  | "failed"
  | "revoked";

const stateLabels: Readonly<Record<AccessibleUiState, string>> = {
  loading: "正在加载",
  empty: "暂无数据",
  stale: "数据已过期",
  partial: "部分数据可用",
  failed: "操作未完成",
  revoked: "授权已失效",
};

export function AccessibleStatusShell({
  kicker,
  title,
  state,
  reason,
  nextStep,
  children,
}: {
  readonly kicker: string;
  readonly title: string;
  readonly state: AccessibleUiState;
  readonly reason: string;
  readonly nextStep: string;
  readonly children?: React.ReactNode;
}) {
  const urgent = state === "failed" || state === "revoked";

  return (
    <main
      id="main-content"
      className="auth-status-shell"
      tabIndex={-1}
      aria-labelledby="ui-state-title"
      data-ui-state={state}
    >
      <p className="section-kicker">{kicker}</p>
      <h1 id="ui-state-title">{title}</h1>
      <div
        className="ui-state-message"
        role={urgent ? "alert" : "status"}
        aria-live={urgent ? "assertive" : "polite"}
      >
        <strong>{stateLabels[state]}</strong>
        <p><span>原因：</span>{reason}</p>
        <p><span>下一步：</span>{nextStep}</p>
      </div>
      {children}
      <Link href="/">返回 Command Deck</Link>
    </main>
  );
}
