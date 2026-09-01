import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="w-full px-6 py-12 md:py-24 border-t border-white/10 flex flex-col gap-12">
      <div className="flex flex-col text-[10vw] md:text-[8vw] leading-[0.8] tracking-tighter uppercase font-medium">
        <span>Cipherprod</span>
        <span className="opacity-50">For Culture and</span>
        <span>Its Counter</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-xs uppercase tracking-widest mt-12">
        <div className="flex flex-col gap-1">
          <span>7 Impasse Franchemont</span>
          <span>Paris 11</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="opacity-50">Tagline</span>
          <span>For culture and its counter</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="opacity-50">Contact</span>
          <a href="mailto:prod@cipher.tv" className="hover:opacity-70 transition-opacity">Work with us</a>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="opacity-50">Socials</span>
          <a href="https://instagram.com/cipher.tv" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">Instagram</a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">LinkedIn</a>
        </div>
      </div>
    </footer>
  );
}
