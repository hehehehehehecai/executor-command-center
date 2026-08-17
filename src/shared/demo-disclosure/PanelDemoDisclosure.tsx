import type { PanelMode } from "@/shared/panel-query";

import styles from "./panel-demo-disclosure.module.css";

export interface PanelDemoDisclosureProps {
  readonly className?: string;
  readonly mode: PanelMode;
  readonly note?: string;
  readonly provenanceLabel: string;
}

export function PanelDemoDisclosure({
  className,
  mode,
  note,
  provenanceLabel,
}: PanelDemoDisclosureProps) {
  const disclosureClassName = className
    ? `${styles.disclosure} ${className}`
    : styles.disclosure;

  return (
    <aside
      className={disclosureClassName}
      aria-label="数据来源"
      data-panel-mode={mode}
    >
      <strong>{provenanceLabel}</strong>
      <span>{mode === "preview" ? "Preview Mode" : "Connected Mode"}</span>
      <small data-demo-marker>
        {mode === "preview"
          ? "Demo · 演示数据 · 完全虚构"
          : "Connected 来源 · 不回退 Demo"}
      </small>
      {note ? <small data-disclosure-note>{note}</small> : null}
    </aside>
  );
}
