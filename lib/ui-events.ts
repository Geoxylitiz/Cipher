'use client';

/**
 * Tiny window-event bus for UI that lives in different React trees
 * (the root layout vs. the WebGL scene).
 */

/** sessionStorage key: the gallery stop to return to after a project page */
export const RETURN_STOP_KEY = 'cipher:return-stop';

const CURSOR_EVENT = 'cipher:cursor';
const INTRO_EVENT = 'cipher:intro-done';

declare global {
  interface Window {
    __cipherIntroDone?: boolean;
  }
}

/** Show a label in the custom cursor ("View", "Open"), or null to reset it. */
export function setCursorLabel(label: string | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string | null>(CURSOR_EVENT, { detail: label }));
}

export function onCursorLabel(cb: (label: string | null) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<string | null>).detail);
  window.addEventListener(CURSOR_EVENT, handler);
  return () => window.removeEventListener(CURSOR_EVENT, handler);
}

/** The intro overlay has started opening: the scene may begin its entrance. */
export function markIntroDone() {
  if (typeof window === 'undefined' || window.__cipherIntroDone) return;
  window.__cipherIntroDone = true;
  window.dispatchEvent(new Event(INTRO_EVENT));
}

export function isIntroDone() {
  return typeof window !== 'undefined' && !!window.__cipherIntroDone;
}

export function onIntroDone(cb: () => void) {
  if (isIntroDone()) {
    cb();
    return () => {};
  }
  window.addEventListener(INTRO_EVENT, cb, { once: true });
  return () => window.removeEventListener(INTRO_EVENT, cb);
}
