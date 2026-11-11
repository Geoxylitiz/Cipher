'use client';

import { useEffect, useState } from 'react';

export const SERIF_STACK = 'var(--font-display), Georgia, "Times New Roman", serif';
export const MONO_STACK = 'var(--font-code), ui-monospace, Menlo, Consolas, monospace';

/**
 * Resolve a next/font CSS variable to a concrete family list for <canvas>,
 * which can't read CSS variables.
 */
export function canvasFamily(cssVar: '--font-display' | '--font-code', fallback: string) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/** True once the display + mono faces are loaded, so canvas text can use them. */
export function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const serif = canvasFamily('--font-display', 'serif');
    const mono = canvasFamily('--font-code', 'monospace');
    Promise.all([
      document.fonts.load(`italic 40px ${serif}`),
      document.fonts.load(`40px ${serif}`),
      document.fonts.load(`500 26px ${mono}`),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}
