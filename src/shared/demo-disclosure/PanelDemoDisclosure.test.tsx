import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PanelDemoDisclosure } from "./PanelDemoDisclosure";

afterEach(cleanup);

describe("PanelDemoDisclosure", () => {
  it("renders one explicit fictional Demo marker for Preview mode", () => {
    render(
      <PanelDemoDisclosure
        mode="preview"
        provenanceLabel="演示数据 · 完全虚构"
        className="panel-slot"
      />,
    );

    const disclosure = screen.getByLabelText("数据来源");
    expect(disclosure).toHaveClass("panel-slot");
    expect(disclosure).toHaveAttribute("data-panel-mode", "preview");
    expect(disclosure).toHaveTextContent("Preview Mode");
    expect(disclosure).toHaveTextContent("Demo · 演示数据 · 完全虚构");
  });

  it("does not label Connected data as a fictional Preview", () => {
    render(
      <PanelDemoDisclosure
        mode="connected"
        provenanceLabel="Injected connected source"
      />,
    );

    const disclosure = screen.getByLabelText("数据来源");
    expect(disclosure).toHaveAttribute("data-panel-mode", "connected");
    expect(disclosure).toHaveTextContent("Connected Mode");
    expect(disclosure).toHaveTextContent("Connected 来源 · 不回退 Demo");
    expect(disclosure).not.toHaveTextContent("Demo · 演示数据 · 完全虚构");
  });
});
