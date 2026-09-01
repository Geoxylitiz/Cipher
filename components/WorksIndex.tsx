'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { worksData, homeTilesData } from '@/data/works';
import Footer from '@/components/Footer';

export default function WorksIndex() {
  const [hoveredWork, setHoveredWork] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const getHoverImage = (id: string) => {
    // just mapping works id 001-012 to homeTilesData 1-12 for placeholder images
    const tileId = parseInt(id, 10);
    const tile = homeTilesData.find(t => t.id === tileId) || homeTilesData[0];
    return tile.src;
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] pt-32 pb-12 flex flex-col justify-between">
      <div className="w-full px-6 mb-24">
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-sm italic tracking-wide text-[#f5f5f2]/60 max-w-md"
        >
          &quot;it&apos;s subtle yet striking, meaning shaped in quiet, intentional forms.&quot;
        </motion.p>
      </div>

      <div className="w-full px-6 flex-grow mb-32">
        <ul className="flex flex-col border-t border-white/10">
          {worksData.map((work, i) => (
            <motion.li 
              key={work.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 + i * 0.05 }}
              className="border-b border-white/10"
              onMouseEnter={() => setHoveredWork(work.id)}
              onMouseLeave={() => setHoveredWork(null)}
            >
              <Link 
                href={`/works/${work.slug}`} 
                className="flex items-baseline py-4 md:py-6 lg:py-8 group"
              >
                <span className="text-xs md:text-sm text-white/50 w-16 md:w-32 tracking-widest transition-colors group-hover:text-white">
                  {work.id}
                </span>
                <span className="text-3xl md:text-6xl lg:text-7xl font-medium tracking-tighter transition-transform duration-500 group-hover:translate-x-4">
                  {work.title}
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>

      <Footer />

      {/* Hover Image Reveal */}
      <AnimatePresence>
        {hoveredWork && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="fixed pointer-events-none z-40 hidden md:block w-64 h-80 overflow-hidden"
            style={{
              left: mousePos.x + 20,
              top: mousePos.y - 160,
            }}
          >
            <Image
              src={getHoverImage(hoveredWork)}
              alt="Preview"
              fill
              className="object-cover"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
