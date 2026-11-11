import type {Metadata} from 'next';
import {Instrument_Serif, JetBrains_Mono} from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Preloader from '@/components/Preloader';
import Cursor from '@/components/Cursor';
import SoundToggle from '@/components/SoundToggle';

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const code = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-code',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cipher Studio',
  description: 'For culture and its counter',
  openGraph: {
    title: 'Cipher Studio',
    description: 'For culture and its counter',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cipher Studio',
    description: 'For culture and its counter',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${display.variable} ${code.variable}`}>
      <body className="antialiased selection:bg-white selection:text-black overflow-x-hidden" suppressHydrationWarning>
        <Preloader />
        <Header />
        {children}
        <SoundToggle />
        <Cursor />
      </body>
    </html>
  );
}
