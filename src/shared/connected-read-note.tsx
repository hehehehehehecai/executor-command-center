import type { ConnectedReadState } from "./connected-read-state";

export function ConnectedReadNote({ state }: { readonly state?: ConnectedReadState }) {
  if (!state) return null;
  return <aside aria-label="真实数据读取状态" data-read-state={state.kind}>
    <p><strong>{state.label}</strong> · {state.scopeLabel}</p>
    <p>{state.description}</p><p>{state.nextStep}</p>
  </aside>;
}
