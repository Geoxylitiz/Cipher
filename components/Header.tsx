import Link from 'next/link';
import LogoMark from './LogoMark';

export default function Header() {
  return (
    <header className="fixed top-0 left-0 w-full z-50 p-6 mix-blend-difference text-[#f5f5f2] flex justify-between items-start pointer-events-none">
      <Link
        href="/"
        className="pointer-events-auto text-xl tracking-tight uppercase font-medium hover:opacity-70 transition-opacity"
      >
        Meowhlock Studio
        <LogoMark className="inline-block w-6 h-6 ml-2 -mt-1" />
      </Link>
    </header>
  );
}
