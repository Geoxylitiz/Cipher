'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import Footer from '@/components/Footer';
import { ROOMS, galleryWorks, type GalleryEntry } from '@/data/gallery';
import { MONO_STACK, SERIF_STACK } from '@/lib/fonts';
import { RETURN_STOP_KEY } from '@/lib/ui-events';

const EASE = [0.22, 1, 0.36, 1] as const;

export default function ProjectView({ entry, next }: { entry: GalleryEntry; next: GalleryEntry }) {
  const room = ROOMS[entry.room];
  const number = String(entry.number).padStart(2, '0');
  const total = String(galleryWorks.length).padStart(2, '0');

  // "Back to the gallery" lands in front of this work (stop n = work number n)
  useEffect(() => {
    try {
      sessionStorage.setItem(RETURN_STOP_KEY, String(entry.number));
    } catch {
      /* storage unavailable */
    }
  }, [entry.number]);

  return (
    <main className="min-h-screen bg-[#070707] text-[#f5f5f2]">
      <section className="px-6 md:px-10 pt-32 md:pt-40">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] md:text-[11px] uppercase tracking-[0.3em] text-white/50"
          style={{ fontFamily: MONO_STACK }}
        >
          <span>No. {number} / {total}</span>
          <span>Room {room.numeral} — {room.name}</span>
        </motion.div>

        <h1
          className="mt-6 text-[16vw] md:text-[10vw] leading-[0.88] italic tracking-tight"
          style={{ fontFamily: SERIF_STACK }}
        >
          {entry.title.split(' ').map((word, i) => (
            <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.06em] mr-[0.22em]">
              <motion.span
                className="inline-block"
                initial={{ y: '105%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 1.1, delay: 0.35 + i * 0.08, ease: [0.76, 0, 0.24, 1] }}
              >
                {word}
              </motion.span>
            </span>
          ))}
        </h1>
      </section>

      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.6 }}
        className="mt-12 md:mt-16 px-6 md:px-10"
      >
        <div className="relative w-full aspect-[4/3] md:aspect-[16/8] overflow-hidden bg-white/5">
          <motion.div
            className="absolute inset-0"
            initial={{ scale: 1.12 }}
            animate={{ scale: 1 }}
            transition={{ duration: 2.4, delay: 0.6, ease: EASE }}
          >
            <Image
              src={entry.src}
              alt={entry.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </div>
      </motion.section>

      <section className="px-6 md:px-10 py-16 md:py-24 grid grid-cols-1 md:grid-cols-12 gap-10">
        <dl
          className="md:col-span-5 grid grid-cols-2 gap-y-4 text-sm"
          style={{ fontFamily: MONO_STACK }}
        >
          <dt className="text-white/40 uppercase text-[11px] tracking-[0.2em]">Discipline</dt>
          <dd className="text-white/85">{entry.category}</dd>
          <dt className="text-white/40 uppercase text-[11px] tracking-[0.2em]">Room</dt>
          <dd className="text-white/85">{room.numeral} — {room.name}</dd>
          <dt className="text-white/40 uppercase text-[11px] tracking-[0.2em]">Studio</dt>
          <dd className="text-white/85">Meowhlock Studio</dd>
        </dl>
        <p
          className="md:col-span-6 md:col-start-7 text-2xl md:text-3xl leading-snug text-white/70"
          style={{ fontFamily: SERIF_STACK }}
        >
          Project notes, credits and imagery for {entry.title} are coming soon.
        </p>
      </section>

      <nav
        className="px-6 md:px-10 pb-20 md:pb-28 flex flex-col md:flex-row md:items-end md:justify-between gap-10 border-t border-white/10 pt-10"
        aria-label="Project navigation"
      >
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.3em] text-white/60 hover:text-white transition-colors"
          style={{ fontFamily: MONO_STACK }}
        >
          ← Back to the gallery
        </Link>
        <Link href={`/works/${next.slug}`} className="group text-right">
          <span
            className="block text-[11px] uppercase tracking-[0.3em] text-white/40"
            style={{ fontFamily: MONO_STACK }}
          >
            Next work — No. {String(next.number).padStart(2, '0')}
          </span>
          <span
            className="mt-2 block text-5xl md:text-7xl italic leading-none transition-transform duration-700 group-hover:-translate-x-3"
            style={{ fontFamily: SERIF_STACK }}
          >
            {next.title} →
          </span>
        </Link>
      </nav>

      <Footer />
    </main>
  );
}
