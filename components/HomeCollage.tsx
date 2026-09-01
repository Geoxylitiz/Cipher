'use client';

import { motion } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';
import LogoMark from '@/components/LogoMark';
import { homeTilesData } from '@/data/works';

export default function HomeCollage() {
  return (
    <div className="w-full relative h-screen overflow-hidden flex items-center justify-center bg-[#0a0a0a]">
      {/* Central Logo */}
      <div className="absolute z-20 pointer-events-none">
        <LogoMark className="w-16 h-16 text-white" />
      </div>

      {/* Rotating Container */}
      <div className="absolute inset-0 flex items-center justify-center z-10 scale-[0.4] sm:scale-[0.6] md:scale-100">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          className="w-full h-full flex items-center justify-center relative"
        >
          {homeTilesData.map((tile, i) => (
            <motion.div
              key={tile.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                opacity: { duration: 1, delay: i * 0.1 },
                scale: { type: 'spring', stiffness: 50, damping: 20, delay: i * 0.1 }
              }}
              className={`absolute ${tile.className} group`}
              style={{
                x: tile.offsetX,
                y: tile.offsetY,
              }}
            >
              {/* Counter-rotating element to keep images upright */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
                className="w-full h-full relative"
              >
                <Link href="/works" className="w-full h-full block relative overflow-hidden">
                  <Image 
                    src={tile.src} 
                    alt={tile.alt} 
                    fill 
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                </Link>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
