import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CommandDeckNavigation } from "./command-deck-navigation";

describe("CommandDeckNavigation", () => {
  let originalOverflow: string;

  beforeEach(() => {
    originalOverflow = document.body.style.overflow;
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = originalOverflow;
  });

  it("keeps the current home link and five frozen Feature destinations in the drawer", () => {
    render(<CommandDeckNavigation />);
    fireEvent.click(screen.getByRole("button", { name: "打开主导航" }));

    const navigation = screen.getByRole("navigation", { name: "移动主导航" });
    const links = within(navigation).getAllByRole("link");

    expect(
      links.map((link) => ({
        name: link.getAttribute("aria-label") ?? link.textContent?.trim(),
        href: link.getAttribute("href"),
      })),
    ).toEqual([
      { name: "舰桥总览", href: "/" },
      { name: "Project Galaxy 项目星图", href: "/project-galaxy" },
      { name: "Flight Log 航行日志", href: "/flight-log" },
      { name: "Mission Control 任务中枢", href: "/mission-control" },
      { name: "Decision Archive 决策档案", href: "/decision-archive" },
      { name: "Copilot AI 副驾驶", href: "/copilot" },
    ]);
    const home = within(navigation).getByRole("link", { name: "舰桥总览" });
    expect(home).toHaveAttribute("aria-current", "page");
    expect(links.filter((link) => link.hasAttribute("aria-current"))).toEqual([
      home,
    ]);
  });

  it("focuses close on open and wraps keyboard focus at both drawer boundaries", () => {
    render(<CommandDeckNavigation />);
    fireEvent.click(screen.getByRole("button", { name: "打开主导航" }));

    const drawer = screen.getByRole("dialog", { name: "EXECUTOR 导航" });
    const close = within(drawer).getByRole("button", { name: "关闭主导航" });
    const last = within(drawer).getByRole("link", { name: "Copilot AI 副驾驶" });

    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(close).toHaveFocus();
    expect(fireEvent.keyDown(close, { key: "Tab", shiftKey: true })).toBe(false);
    expect(last).toHaveFocus();
    expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(false);
    expect(close).toHaveFocus();
  });

  it("leaves interior Tab movement to the browser", () => {
    render(<CommandDeckNavigation />);
    fireEvent.click(screen.getByRole("button", { name: "打开主导航" }));

    const drawer = screen.getByRole("dialog", { name: "EXECUTOR 导航" });
    const interior = within(drawer).getByRole("link", {
      name: "Project Galaxy 项目星图",
    });
    interior.focus();

    // jsdom does not perform native Tab movement; verify our handler permits it.
    expect(fireEvent.keyDown(interior, { key: "Tab" })).toBe(true);
    expect(interior).toHaveFocus();
    expect(fireEvent.keyDown(interior, { key: "Tab", shiftKey: true })).toBe(true);
    expect(interior).toHaveFocus();
  });

  it("restores the previous overflow after close and captures it again when reopened", () => {
    document.body.style.overflow = "scroll";
    render(<CommandDeckNavigation />);
    const trigger = screen.getByRole("button", { name: "打开主导航" });

    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "关闭主导航" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("scroll");

    document.body.style.overflow = "clip";
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "关闭主导航" }));
    expect(document.body.style.overflow).toBe("clip");
  });

  it("restores scrolling and trigger focus when Escape closes the drawer", () => {
    document.body.style.overflow = "scroll";
    render(<CommandDeckNavigation />);
    const trigger = screen.getByRole("button", { name: "打开主导航" });
    fireEvent.click(trigger);

    expect(document.body.style.overflow).toBe("hidden");
    expect(fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" }))
      .toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("restores scrolling and releases its keyboard handler when unmounted open", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = render(<CommandDeckNavigation />);
    fireEvent.click(screen.getByRole("button", { name: "打开主导航" }));
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("scroll");
    expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(true);
  });

  it("restores scrolling when a Feature destination closes the drawer", () => {
    document.body.style.overflow = "scroll";
    render(<CommandDeckNavigation />);
    fireEvent.click(screen.getByRole("button", { name: "打开主导航" }));

    const navigation = screen.getByRole("navigation", { name: "移动主导航" });
    const destination = within(navigation).getByRole("link", {
      name: "Copilot AI 副驾驶",
    });
    destination.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(destination);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("scroll");
  });
});
