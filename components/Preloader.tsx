'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useProgress } from '@react-three/drei';

export default function Preloader() {
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const { active, loaded, total, progress } = useProgress();

  useEffect(() => {
    setLoading(true);

    // Only the home page has a Three.js scene to wait for. Other routes do
    // not have Drei assets, so let their route-change preloader dismiss on
    // the next frame instead of waiting for a nonexistent loader.
    if (pathname !== '/') {
      const frame = requestAnimationFrame(() => setLoading(false));
      return () => cancelAnimationFrame(frame);
    }

    // useProgress is updated by Drei's loaders (including <Image /> and
    // <Preload all />). Keep the overlay up until every asset is complete.
    if (!active && total > 0 && loaded === total) {
      const timeout = window.setTimeout(() => setLoading(false), 200);
      return () => window.clearTimeout(timeout);
    }
  }, [pathname, active, loaded, total]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
          className="fixed inset-0 z-[100] bg-[#0a0a0a] text-[#f5f5f2] flex items-center justify-center"
        >
          {pathname === '/about' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs uppercase tracking-widest animate-pulse"
            >
              loading data
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-4xl md:text-8xl font-medium tracking-tighter"
            >
              {Math.round(progress)}%
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
