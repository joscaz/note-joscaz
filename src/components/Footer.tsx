export function Footer() {
  return (
    <footer className="border-t border-white/5 mt-20 py-10 px-6 md:px-10 bg-bg">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="flex flex-col items-center md:items-start gap-1">
          <div className="font-display font-extrabold text-xl">NoteJoscaz AI</div>
          <div className="text-xs text-muted font-mono tracking-wider">
            Turning Sound Into Structure
          </div>
        </div>
        <nav className="flex gap-6 text-xs font-mono uppercase tracking-wider text-muted">
          <a href="#" className="hover:text-text transition-colors">GitHub</a>
          <a href="#upload" className="hover:text-text transition-colors">Demo</a>
          <a href="#" className="hover:text-text transition-colors">Contact</a>
        </nav>
        <div className="text-[10px] text-muted font-mono">
          © {new Date().getFullYear()} NoteJoscaz — All rights reserved
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-white/5 text-[10px] text-muted font-mono leading-relaxed text-center md:text-left">
        Transcription powered by the{' '}
        <a
          href="https://arxiv.org/abs/2303.04485"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted hover:text-text transition-colors"
        >
          Onsets &amp; Velocities
        </a>{' '}
        architecture by Eulàlia Febrer Coll, Joan Lluís Travé Pla, and Andrés
        Fernández Rodríguez (IAMúsica, grant 389062 INV-23/2021, Institut
        d'Estudis Baleàrics). The guitar model is their piano architecture
        fine-tuned for this project.
      </div>
    </footer>
  );
}
