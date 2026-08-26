"use client";

import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type BackgroundState = {
  readonly element: HTMLElement;
  readonly inert: boolean;
  readonly ariaHidden: string | null;
  readonly modalMarker: string | null;
};

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function concealBackground(dialog: HTMLElement) {
  const background = new Map<HTMLElement, BackgroundState>();
  let current: HTMLElement = dialog;

  while (current.parentElement) {
    const parent = current.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === current || !(sibling instanceof HTMLElement) || background.has(sibling)) {
        continue;
      }
      background.set(sibling, {
        element: sibling,
        inert: sibling.hasAttribute("inert"),
        ariaHidden: sibling.getAttribute("aria-hidden"),
        modalMarker: sibling.getAttribute("data-modal-background-inert"),
      });
      sibling.setAttribute("inert", "");
      sibling.setAttribute("aria-hidden", "true");
      sibling.setAttribute("data-modal-background-inert", "true");
    }

    if (parent === document.body) break;
    current = parent;
  }

  return () => {
    for (const state of background.values()) {
      if (state.inert) state.element.setAttribute("inert", "");
      else state.element.removeAttribute("inert");

      if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
      else state.element.setAttribute("aria-hidden", state.ariaHidden);

      if (state.modalMarker === null) {
        state.element.removeAttribute("data-modal-background-inert");
      } else {
        state.element.setAttribute("data-modal-background-inert", state.modalMarker);
      }
    }
  };
}

export function useModalFocusBoundary(input: {
  readonly active: boolean;
  readonly dialogRef: RefObject<HTMLElement | null>;
  readonly initialFocusRef: RefObject<HTMLElement | null>;
  readonly restoreFocusRef: RefObject<HTMLElement | null>;
  readonly closeBlocked: boolean;
  readonly onRequestClose: () => void;
}) {
  const closeBlockedRef = useRef(input.closeBlocked);
  const onRequestCloseRef = useRef(input.onRequestClose);

  useEffect(() => {
    closeBlockedRef.current = input.closeBlocked;
    onRequestCloseRef.current = input.onRequestClose;
  }, [input.closeBlocked, input.onRequestClose]);

  useEffect(() => {
    if (!input.active) return;
    const dialog = input.dialogRef.current;
    if (!dialog) return;

    const restoreBackground = concealBackground(dialog);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusInside = () => {
      const initial = input.initialFocusRef.current;
      if (initial && !initial.matches(":disabled")) {
        initial.focus();
        return;
      }
      const first = focusableElements(dialog)[0];
      (first ?? dialog).focus();
    };

    const handleFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || !dialog.contains(event.target)) {
        focusInside();
      }
    };

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!closeBlockedRef.current) {
          event.preventDefault();
          onRequestCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("focusin", handleFocus);
    document.addEventListener("keydown", handleKeyboard);
    focusInside();

    return () => {
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("keydown", handleKeyboard);
      document.body.style.overflow = previousOverflow;
      restoreBackground();
      if (input.restoreFocusRef.current?.isConnected) {
        input.restoreFocusRef.current.focus();
      }
    };
  }, [input.active, input.dialogRef, input.initialFocusRef, input.restoreFocusRef]);
}
