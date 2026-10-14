"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function OnboardingReadRetry() {
  const [pending, setPending] = useState(false);
  return <button type="button" data-onboarding-primary="true" disabled={pending} aria-busy={pending} onClick={() => { setPending(true); window.location.reload(); }}>{pending ? "正在重新读取接入状态…" : "重新读取接入状态"}</button>;
}

export function OnboardingRepositoryDisclosure({ children }: { readonly children: ReactNode }) {
  const element = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => { if (window.location.hash === "#repositories" && element.current) element.current.open = true; };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return <details ref={element}><summary>添加仓库与授权管理</summary>{children}</details>;
}
