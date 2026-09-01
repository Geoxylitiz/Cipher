'use client';

import { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';
import LogoMark from '@/components/LogoMark';
import { homeTilesData } from '@/data/works';

type Pointer = { x: number; y: number };

const DEPTHS = [70, -110, 145, -55, 115, -135, 30, 170, -85];
const TILTS = [-7, 5, -4, 8, -6, 4, -8, 6, -3];

export default function HomeCollage() {
  const [pointer, setPointer] = useState<Pointer>({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: (event.clientX - bounds.left) / bounds.width - 0.5,
      y: (event.clientY - bounds.top) / bounds.height - 0.5,
    });
  }, []);

  return (
    <section
      aria-label="Selected work"
      className="relative flex h-[100svh] w-full cursor-crosshair items-center justify-center overflow-hidden bg-[#090909]"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        setPointer({ x: 0, y: 0 });
        setHoveredId(null);
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.075),transparent_34%),linear-gradient(115deg,rgba(255,255,255,0.035),transparent_42%)]" />
      <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      <div className="absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />

      <motion.div
        className="absolute inset-0 z-10 flex items-center justify-center [perspective:1200px]"
        animate={{
          rotateX: reduceMotion ? 0 : pointer.y * -11,
          rotateY: reduceMotion ? 0 : pointer.x * 14,
          scale: hoveredId ? 0.97 : 1,
        }}
        transition={{ type: 'spring', stiffness: 80, damping: 18, mass: 0.8 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="relative h-full w-full scale-[0.38] sm:scale-[0.58] md:scale-100" style={{ transformStyle: 'preserve-3d' }}>
          {homeTilesData.map((tile, index) => {
            const active = hoveredId === tile.id;
            const anotherTileIsActive = hoveredId !== null && !active;

            return (
              <motion.article
                key={tile.id}
                className={`group absolute ${tile.className}`}
                initial={{ opacity: 0, scale: 0.84 }}
                animate={{
                  x: tile.offsetX,
                  y: tile.offsetY,
                  z: active ? DEPTHS[index] + 180 : DEPTHS[index],
                  rotateZ: active ? 0 : TILTS[index],
                  rotateX: active ? 0 : -4,
                  scale: active ? 1.1 : 1,
                  opacity: anotherTileIsActive ? 0.42 : 1,
                }}
                transition={{
                  opacity: { duration: 0.3 },
                  default: { type: 'spring', stiffness: 115, damping: 18, mass: 0.7, delay: index * 0.035 },
                }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                <Link
                  href="/works"
                  aria-label={`View ${tile.alt} project`}
                  className="relative block h-full w-full overflow-hidden bg-white/5 outline-none ring-offset-4 ring-offset-[#090909] focus-visible:ring-2 focus-visible:ring-white"
                  onPointerEnter={() => setHoveredId(tile.id)}
                  onFocus={() => setHoveredId(tile.id)}
                  onBlur={() => setHoveredId(null)}
                >
                  <Image src={tile.src} alt={tile.alt} fill sizes="(max-width: 640px) 280px, 320px" className="object-cover grayscale-[0.18] transition duration-700 ease-out group-hover:scale-110 group-hover:grayscale-0" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-white/10 opacity-65 transition-opacity duration-500 group-hover:opacity-30" />
                  <div className="absolute bottom-0 left-0 right-0 flex translate-y-full items-center justify-between px-4 pb-4 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-transform duration-500 group-hover:translate-y-0 group-focus-visible:translate-y-0">
                    <span>View work</span><span aria-hidden="true">↗</span>
                  </div>
                </Link>
              </motion.article>
            );
          })}
        </div>
      </motion.div>

      <div className="pointer-events-none absolute z-20 grid h-20 w-20 place-items-center rounded-full border border-white/15 bg-black/25 backdrop-blur-sm">
        <LogoMark className="h-10 w-10 text-white" />
      </div>
      <p className="pointer-events-none absolute bottom-7 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.32em] text-white/45">Move through selected work</p>
    </section>
  );
}
