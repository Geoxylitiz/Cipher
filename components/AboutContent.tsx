'use client';

import { motion } from 'motion/react';
import Footer from '@/components/Footer';
import { useEffect, useState } from 'react';

const rowA = "CLASSICS CREATORS CLUB — CAUTIOUS CURATORS COLLECTIVE — CREATIVE CRAFTERS CONSTELLATION — COUNTERCULTURE CREATING CULTURE — ";
const rowB = "CIPHER — CIPHER — CIPHER — CIPHER — CIPHER — CIPHER — CIPHER — CIPHER — CIPHER — CIPHER — ";
const rowC = "COUNTERCULTURE CREATING CULTURE — CREATIVE CRAFTERS CONSTELLATION — CAUTIOUS CURATORS COLLECTIVE — CLASSICS CREATORS CLUB — ";

export default function AboutContent() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    // Artificial delay to wait for preloader to finish its pulse slightly longer for About
    const timer = setTimeout(() => setMounted(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-[#0a0a0a]" />;
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] pt-32 pb-12 overflow-hidden flex flex-col justify-between">
      
      <div className="flex flex-col gap-4 mb-32 relative w-[200%] md:w-[150%] -ml-[50%] md:-ml-[25%] opacity-90">
        <div className="w-full flex overflow-hidden">
          <motion.div 
            animate={{ x: ['0%', '-50%'] }}
            transition={{ ease: 'linear', duration: 40, repeat: Infinity }}
            className="flex whitespace-nowrap text-5xl md:text-8xl tracking-widest uppercase font-medium"
          >
            {rowA}{rowA}{rowA}
          </motion.div>
        </div>
        
        <div className="w-full flex overflow-hidden">
          <motion.div 
            animate={{ x: ['-50%', '0%'] }}
            transition={{ ease: 'linear', duration: 30, repeat: Infinity }}
            className="flex whitespace-nowrap text-5xl md:text-8xl tracking-widest uppercase font-medium"
          >
            {rowB}{rowB}{rowB}
          </motion.div>
        </div>
        
        <div className="w-full flex overflow-hidden">
          <motion.div 
            animate={{ x: ['0%', '-50%'] }}
            transition={{ ease: 'linear', duration: 45, repeat: Infinity }}
            className="flex whitespace-nowrap text-5xl md:text-8xl tracking-widest uppercase font-medium"
          >
            {rowC}{rowC}{rowC}
          </motion.div>
        </div>
      </div>

      <div className="px-6 md:px-24 mb-32 max-w-4xl mx-auto flex flex-col gap-12 text-[#f5f5f2]">
        <motion.h2 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-3xl md:text-5xl font-medium tracking-tight leading-tight"
        >
          Creators, capable crafters, and cautious curators.
        </motion.h2>
        
        <div className="flex flex-col gap-6 text-lg md:text-xl font-serif text-white/80 leading-relaxed">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            We build, bend, break, and rebuild. We craft classics while exploring what&apos;s next. Cipher is a creative production company standing firmly between the established and the experimental.
          </motion.p>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            Born in Paris, reaching beyond. We support brands, agencies, and artists worldwide from concept to final delivery — offering production, casting, studio, and post-production.
          </motion.p>
        </div>
      </div>

      <Footer />
    </main>
  );
}
