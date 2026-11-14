'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { canvasFamily, useFontsReady } from '@/lib/fonts';

const LOAD_TIMEOUT_MS = 12000;

/**
 * Plain stand-in shown while an artwork image loads, and kept if it never
 * does. A muted wash with the work's title, so the wall never looks broken.
 */
function makeStandIn(title: string) {
  const w = 1024, h = 768;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#3a332c');
  g.addColorStop(1, '#1d1a17');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(236, 232, 225, 0.85)';
  ctx.font = `italic 84px ${canvasFamily('--font-display', 'Georgia, serif')}`;
  ctx.fillText(title, w / 2, h / 2 + 20);
  ctx.fillStyle = 'rgba(236, 232, 225, 0.4)';
  ctx.font = `24px ${canvasFamily('--font-code', 'ui-monospace, monospace')}`;
  ctx.fillText('IMAGE TO COME', w / 2, h / 2 + 90);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Loads an artwork image without suspending or throwing.
 *
 * drei's useTexture throws when an image fails, which took down the whole
 * canvas whenever the placeholder image host was slow or offline. Here the
 * panel shows a stand-in until the image arrives, and keeps it on failure.
 */
export function useArtworkTexture(src: string, title: string): THREE.Texture {
  const fontsReady = useFontsReady();
  const standIn = useMemo(
    () => (typeof document === 'undefined' ? new THREE.Texture() : makeStandIn(title)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, fontsReady],
  );
  const [loaded, setLoaded] = useState<{ src: string; tex: THREE.Texture } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    // A hung request would otherwise hold the intro loader until its own cap
    const timer = window.setTimeout(() => { cancelled = true; }, LOAD_TIMEOUT_MS);
    loader.load(
      src,
      (tex) => {
        window.clearTimeout(timer);
        if (cancelled) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        setLoaded({ src, tex });
      },
      undefined,
      () => {
        window.clearTimeout(timer);
        console.warn(`Artwork image unavailable, showing stand-in: ${src}`);
      },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [src]);

  useEffect(() => () => standIn.dispose(), [standIn]);
  useEffect(() => () => loaded?.tex.dispose(), [loaded]);

  return loaded?.src === src ? loaded.tex : standIn;
}
