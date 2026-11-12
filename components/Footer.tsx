export default function Footer() {
  return (
    <footer className="w-full px-6 py-12 md:py-24 border-t border-white/10 flex flex-col gap-12">
      <div className="flex flex-col text-[10vw] md:text-[8vw] leading-[0.8] tracking-tighter uppercase font-medium">
        <span>Meowhlock</span>
        <span className="opacity-50">Studio</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-xs uppercase tracking-widest mt-12">
        <div className="flex flex-col gap-1">
          <span className="opacity-50">Tagline</span>
          <span>Curious work, nine lives deep.</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="opacity-50">Contact</span>
          {/* TODO: add the studio's contact address */}
          <a href="mailto:" className="hover:opacity-70 transition-opacity">Work with us</a>
        </div>

        <div className="flex flex-col gap-1">
          <span className="opacity-50">Socials</span>
          {/* TODO: replace with the studio's real profiles */}
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">Instagram</a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">LinkedIn</a>
        </div>
      </div>
    </footer>
  );
}
