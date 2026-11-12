'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useProgress } from '@react-three/drei';
import { markIntroDone } from '@/lib/ui-events';
import { MONO_STACK, SERIF_STACK } from '@/lib/fonts';

const TITLE = 'Meowhlock Studio';
const MIN_INTRO_MS = 2200;   // let the title finish revealing before we open
const MAX_WAIT_MS = 15000;   // never trap the visitor behind the loader
const EASE = [0.76, 0, 0.24, 1] as const;

/**
 * First visit to "/": a black stage, the studio name rising letter by letter,
 * a small loading count, then the screen splits open onto the gallery as the
 * camera pushes in (see markIntroDone).
 *
 * Other route changes: a quick black wipe that fades away.
 */
export default function Preloader() {
  const pathname = usePathname();
  const { active, loaded, total, progress } = useProgress();
  const [loading, setLoading] = useState(true);
  const [isIntro, setIsIntro] = useState(pathname === '/');
  const mountedAt = useRef(0);
  const firstLoad = useRef(true);

  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  // Each route change shows the overlay again
  useEffect(() => {
    if (firstLoad.current) return;
    setIsIntro(false);
    setLoading(true);
  }, [pathname]);

  useEffect(() => {
    if (!loading) return;

    if (pathname !== '/') {
      firstLoad.current = false;
      const frame = requestAnimationFrame(() => setLoading(false));
      return () => cancelAnimationFrame(frame);
    }

    const assetsReady = !active && total > 0 && loaded === total;
    const elapsed = performance.now() - mountedAt.current;
    const open = () => {
      firstLoad.current = false;
      markIntroDone();
      setLoading(false);
    };

    if (assetsReady) {
      const wait = isIntro ? Math.max(200, MIN_INTRO_MS - elapsed) : 150;
      const t = window.setTimeout(open, wait);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(open, Math.max(0, MAX_WAIT_MS - elapsed));
    return () => window.clearTimeout(t);
  }, [loading, pathname, active, loaded, total, isIntro]);

  const pct = Math.round(progress);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[100] pointer-events-auto text-[#f5f5f2]"
          initial={{ opacity: 1 }}
          exit={isIntro ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: isIntro ? 1.3 : 0.6, ease: EASE }}
        >
          {/* Two halves that split apart to open the stage */}
          <motion.div
            className="absolute inset-x-0 top-0 h-1/2 bg-[#070707]"
            exit={isIntro ? { y: '-100%' } : undefined}
            transition={{ duration: 1.1, delay: 0.35, ease: EASE }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-[#070707]"
            exit={isIntro ? { y: '100%' } : undefined}
            transition={{ duration: 1.1, delay: 0.35, ease: EASE }}
          />

          {isIntro && (
            <>
              <motion.h1
                className="absolute inset-0 flex items-center justify-center px-6 text-[13vw] md:text-[9vw] leading-none italic tracking-tight"
                style={{ fontFamily: SERIF_STACK }}
                aria-label={TITLE}
                exit={{ opacity: 0, y: -24, filter: 'blur(6px)' }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                {TITLE.split('').map((ch, i) => (
                  <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.08em]" aria-hidden>
                    <motion.span
                      className="inline-block"
                      initial={{ y: '110%' }}
                      animate={{ y: '0%' }}
                      transition={{ duration: 1, delay: 0.2 + i * 0.045, ease: EASE }}
                    >
                      {ch === ' ' ? ' ' : ch}
                    </motion.span>
                  </span>
                ))}
              </motion.h1>

              <motion.div
                className="absolute inset-x-6 md:inset-x-10 bottom-8 flex items-end justify-between text-[10px] uppercase tracking-[0.3em] text-white/50"
                style={{ fontFamily: MONO_STACK }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                <span>Curious work, nine lives deep.</span>
                <span className="tabular-nums">Loading {String(pct).padStart(3, '0')}</span>
              </motion.div>

              {/* Thin progress line along the bottom edge */}
              <motion.div
                className="absolute left-0 bottom-0 h-px bg-white/40 origin-left"
                style={{ width: '100%', scaleX: pct / 100 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
