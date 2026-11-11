'use client';

import { useEffect, useRef, useState } from 'react';
import { onCursorLabel } from '@/lib/ui-events';
import { MONO_STACK } from '@/lib/fonts';

/**
 * Custom cursor: a small difference-blended dot that eases after the mouse,
 * rings around links/buttons, and grows into a labelled disc ("View",
 * "Open") when the 3D scene asks for it. Mouse/trackpad devices only.
 */
export default function Cursor() {
  const el = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [overLink, setOverLink] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add('has-custom-cursor');

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { ...target };
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      setVisible(true);
      const interactive = (e.target as Element | null)?.closest?.('a, button, [role="button"]');
      setOverLink(!!interactive);
    };
    const onLeave = () => setVisible(false);
    const tick = () => {
      pos.x += (target.x - pos.x) * 0.22;
      pos.y += (target.y - pos.y) * 0.22;
      if (el.current) el.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    const offLabel = onCursorLabel(setLabel);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      offLabel();
      document.documentElement.classList.remove('has-custom-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;

  const size = label ? 76 : overLink ? 34 : 8;

  return (
    <div
      ref={el}
      aria-hidden
      className="fixed top-0 left-0 z-[200] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms' }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          background: label ? '#f5f5f2' : overLink ? 'transparent' : '#ffffff',
          border: overLink && !label ? '1px solid rgba(255,255,255,0.9)' : '1px solid transparent',
          mixBlendMode: label ? 'normal' : 'difference',
          transition:
            'width 450ms cubic-bezier(0.22,1,0.36,1), height 450ms cubic-bezier(0.22,1,0.36,1), margin 450ms cubic-bezier(0.22,1,0.36,1), background 300ms',
        }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.2em] text-[#0a0a0a] whitespace-nowrap"
          style={{
            fontFamily: MONO_STACK,
            opacity: label ? 1 : 0,
            transition: 'opacity 250ms',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
