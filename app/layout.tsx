import type {Metadata} from 'next';
import './globals.css';
import Header from '@/components/Header';
import Preloader from '@/components/Preloader';

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
    <html lang="en">
      <body className="antialiased selection:bg-white selection:text-black overflow-x-hidden" suppressHydrationWarning>
        <Preloader />
        <Header />
        {children}
      </body>
    </html>
  );
}
