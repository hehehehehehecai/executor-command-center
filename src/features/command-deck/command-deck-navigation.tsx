"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback((restoreFocus = true) => {
    setIsDrawerOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyboard);
    };
  }, [closeDrawer, isDrawerOpen]);

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
        <div className="mobile-navigation-layer">
          <div
            className="mobile-navigation-backdrop"
            data-navigation-backdrop
            aria-hidden="true"
            onMouseDown={() => closeDrawer()}
          />
          <aside
            ref={drawerRef}
            id="mobile-command-navigation"
            className="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-command-navigation-title"
          >
            <div className="mobile-navigation-heading">
              <strong id="mobile-command-navigation-title">EXECUTOR 导航</strong>
              <button
                ref={closeButtonRef}
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
        </div>
      ) : null}
    </>
  );
}
