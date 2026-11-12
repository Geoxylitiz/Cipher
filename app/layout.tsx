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
  title: 'Meowhlock Studio',
  description: 'Curious work, nine lives deep.',
  openGraph: {
    title: 'Meowhlock Studio',
    description: 'Curious work, nine lives deep.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Meowhlock Studio',
    description: 'Curious work, nine lives deep.',
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
