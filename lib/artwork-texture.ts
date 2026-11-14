'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

const LOAD_TIMEOUT_MS = 12000;

const PALETTES = [
  ['#e8dccb', '#c4572e', '#1f2a44', '#e2b23f'],
  ['#f1ece2', '#27463a', '#d98c5f', '#141414'],
  ['#14233a', '#e9e1d0', '#b23a48', '#f0a04b'],
  ['#efe6d5', '#2b2b2b', '#7a9e9f', '#d95d39'],
  ['#1d1b1a', '#e6d5b8', '#e45826', '#f0a500'],
  ['#dfe7e2', '#33658a', '#f6ae2d', '#2f4858'],
];

/** Small deterministic random generator, seeded from the work's title. */
function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stand-in shown while an artwork image loads, and kept if it never does:
 * an abstract colour-field composition generated from the title, so every
 * work gets its own picture and the wall never looks broken.
 */
function makeStandIn(title: string) {
  const w = 1024, h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rnd = seeded(title);
  const palette = PALETTES[Math.floor(rnd() * PALETTES.length)];

  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, w, h);

  // A few large overlapping fields
  const fields = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < fields; i++) {
    ctx.save();
    ctx.translate(rnd() * w, rnd() * h);
    ctx.rotate((rnd() - 0.5) * 0.5);
    ctx.globalAlpha = 0.82 + rnd() * 0.18;
    ctx.fillStyle = palette[1 + Math.floor(rnd() * 3)];
    const fw = w * (0.25 + rnd() * 0.55);
    const fh = h * (0.2 + rnd() * 0.5);
    if (rnd() < 0.3) {
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(fw, fh) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
    }
    ctx.restore();
  }

  // One thin line for tension
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = palette[1 + Math.floor(rnd() * 3)];
  ctx.lineWidth = 6 + rnd() * 10;
  ctx.beginPath();
  ctx.moveTo(rnd() * w, 0);
  ctx.lineTo(rnd() * w, h);
  ctx.stroke();

  // Canvas grain
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
    ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  ctx.globalAlpha = 1;

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
  const standIn = useMemo(
    () => (typeof document === 'undefined' ? new THREE.Texture() : makeStandIn(title)),
    [title],
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
