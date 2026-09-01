'use client';

import { motion } from 'motion/react';
import Footer from '@/components/Footer';
import Link from 'next/link';

const talentsData = [
  { id: 1, name: 'Alice Dupont', role: 'Director' },
  { id: 2, name: 'Ben Carson', role: 'Photographer' },
  { id: 3, name: 'Chloe Chen', role: 'Creative Director' },
  { id: 4, name: 'David Lee', role: 'DOP' },
  { id: 5, name: 'Emma Watson', role: 'Set Designer' },
  { id: 6, name: 'Felix Kjellberg', role: 'Editor' },
];

export default function TalentsContent() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] pt-32 pb-12 flex flex-col justify-between">
      <div className="w-full px-6 flex-grow mb-32 max-w-5xl mx-auto">
        <h1 className="text-3xl md:text-5xl uppercase tracking-tighter mb-16">Talents</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {talentsData.map((talent, i) => (
            <motion.div
              key={talent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
              className="flex flex-col gap-2 group cursor-pointer"
            >
              <div className="w-full aspect-[3/4] bg-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              <div className="flex flex-col mt-4">
                <span className="text-xl uppercase tracking-widest">{talent.name}</span>
                <span className="text-xs text-white/50 uppercase tracking-widest">{talent.role}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      
      <Footer />
    </main>
  );
}
