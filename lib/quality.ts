'use client';

/**
 * Rendering quality tier for the 3D gallery.
 *
 * high: real spotlights on every work, depth of field, chromatic aberration,
 *       MSAA, up to 2x pixel ratio.
 * low:  no real-time spotlights (light pools are faked with soft decals),
 *       no depth of field / chromatic aberration, no MSAA, max 1.5x pixel
 *       ratio, fewer dust motes. Meant for phones and weak GPUs.
 *
 * Override for testing with ?quality=low or ?quality=high.
 */
export type Quality = 'high' | 'low';

const STORAGE_KEY = 'cipher:quality';

export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high';

  const param = new URLSearchParams(window.location.search).get('quality');
  if (param === 'low' || param === 'high') return param;

  // A previous visit already found this device too slow
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === 'low') return 'low';
  } catch {
    /* storage unavailable */
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const touchPhone =
    window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 820;
  const fewCores = (nav.hardwareConcurrency ?? 8) <= 4;
  const lowMemory = (nav.deviceMemory ?? 8) <= 4;
  return touchPhone || fewCores || lowMemory ? 'low' : 'high';
}

/** Remember a runtime downgrade for the rest of the session. */
export function rememberLowQuality() {
  try {
    sessionStorage.setItem(STORAGE_KEY, 'low');
  } catch {
    /* ignore */
  }
}
