import Link from 'next/link';

export default function Header() {
  return (
    <header className="fixed top-0 left-0 w-full z-50 p-6 mix-blend-difference text-[#f5f5f2] flex justify-between items-start pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        <Link href="/" className="text-xl tracking-tight uppercase font-medium hover:opacity-70 transition-opacity">
          Meowhlock
        </Link>
        <a 
          href="https://www.studiojour.paris/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[10px] tracking-widest uppercase opacity-50 hover:opacity-100 transition-opacity mt-1"
        >
          Design by Studio Jour
        </a>
      </div>
      
      <nav className="flex flex-col items-end gap-1 pointer-events-auto">
        <div className="flex gap-4">
          <Link href="/works" className="text-xs uppercase tracking-widest hover:opacity-70 transition-opacity">Works</Link>
          <Link href="/talents" className="text-xs uppercase tracking-widest hover:opacity-70 transition-opacity">Talents</Link>
        </div>
        <Link href="/about" className="text-xs uppercase tracking-widest hover:opacity-70 transition-opacity mt-1">About</Link>
      </nav>
    </header>
  );
}
