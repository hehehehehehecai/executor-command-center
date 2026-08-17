"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { featureRegistry } from "@/shared/features/feature-registry";

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <p className="navigation-kicker">Workspace</p>
      <Link
        className="workspace-home-link"
        href="/"
        aria-current="page"
        prefetch={false}
        onClick={onNavigate}
      >
        舰桥总览
      </Link>

      <ol className="workspace-navigation-list">
        {featureRegistry.map((feature) => (
          <li key={feature.id}>
            <Link
              className="workspace-navigation-link"
              href={feature.route}
              prefetch={false}
              aria-label={`${feature.title} ${feature.subtitle}`}
              onClick={onNavigate}
            >
              <span>{feature.title}</span>
              <small>{feature.subtitle}</small>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}

export function CommandDeckNavigation() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = (restoreFocus = true) => {
    setIsDrawerOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isDrawerOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        className="mobile-navigation-trigger"
        type="button"
        aria-label="打开主导航"
        aria-expanded={isDrawerOpen}
        aria-controls="mobile-command-navigation"
        onClick={() => setIsDrawerOpen(true)}
      >
        菜单
      </button>

      <nav className="workspace-navigation" aria-label="桌面主导航">
        <NavigationLinks />
      </nav>

      {isDrawerOpen ? (
        <aside
          id="mobile-command-navigation"
          className="mobile-navigation-drawer"
          aria-label="移动导航抽屉"
        >
          <div className="mobile-navigation-heading">
            <strong>EXECUTOR 导航</strong>
            <button
              type="button"
              aria-label="关闭主导航"
              onClick={() => closeDrawer()}
            >
              关闭
            </button>
          </div>
          <nav aria-label="移动主导航">
            <NavigationLinks onNavigate={() => closeDrawer(false)} />
          </nav>
        </aside>
      ) : null}
    </>
  );
}
