import { useState } from 'react';
import type { CuratedMidi } from '../utils/curatedMidis';

interface CuratedLibraryProps {
  curatedMidis: CuratedMidi[];
  onSelectCurated: (song: CuratedMidi) => void;
  activeCuratedId: string | null;
  loadingCuratedId: string | null;
  busy: boolean;
}

const genres: Array<{ id: string; label: string }> = [
  { id: 'All', label: 'All' },
  { id: 'Classical', label: 'Classical' },
  { id: 'Pop/Modern', label: 'Pop & Modern' },
  { id: 'Game/Anime', label: 'Game & Anime' },
  { id: 'Special', label: 'Special & Fun' },
];

export function CuratedLibrary({
  curatedMidis,
  onSelectCurated,
  activeCuratedId,
  loadingCuratedId,
  busy,
}: CuratedLibraryProps) {
  const [selectedGenre, setSelectedGenre] = useState<string>('All');

  const filteredMidis = curatedMidis.filter((song) => {
    if (selectedGenre === 'All') return true;
    return song.genre === selectedGenre;
  });

  return (
    <section className="px-4 md:px-10 py-16 md:py-24 bg-bg">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="text-xs uppercase tracking-[0.4em] text-muted font-mono">Curated Library</div>
          <h3 className="font-display text-2xl md:text-3xl font-extrabold text-text">
            Official MIDI Collection
          </h3>
          <p className="text-muted text-sm max-w-lg mx-auto">
            Play high-fidelity curated MIDI files and custom arrangements directly in the interactive visualizer.
          </p>
        </div>

        {/* Genre Filter Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8 bg-black/10 p-1.5 rounded-full border border-white/5 max-w-fit mx-auto backdrop-blur-sm">
          {genres.map((g) => {
            const count = g.id === 'All'
              ? curatedMidis.length
              : curatedMidis.filter(m => m.genre === g.id).length;

            if (count === 0 && g.id !== 'All') return null;

            const isActive = selectedGenre === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGenre(g.id)}
                className={`px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-white/10 text-text border border-white/15'
                    : 'border border-transparent text-muted hover:text-text'
                }`}
              >
                <span>{g.label}</span>
                <span className={`text-[10px] opacity-65 px-1 py-0.5 rounded bg-black/40 font-semibold font-sans`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMidis.map((song) => {
            const isActive = activeCuratedId === song.id;
            const isLoading = loadingCuratedId === song.id;

            return (
              <button
                key={song.id}
                type="button"
                onClick={() => onSelectCurated(song)}
                disabled={busy}
                className={`group text-left relative p-5 rounded-2xl border transition-all duration-300 bg-white/[0.02] ${
                  isActive
                    ? 'border-piano-green bg-piano-green/[0.04]'
                    : 'border-white/5 hover:border-white/20 hover:bg-white/[0.05]'
                } disabled:opacity-70 disabled:cursor-not-allowed`}
              >
                <div className="flex flex-col h-full justify-between gap-1 relative z-10">
                  <div>
                    {isActive && (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-piano-green opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-piano-green"></span>
                        </span>
                      </div>
                    )}
                    <h4 className="font-display font-bold text-base text-text group-hover:text-piano-green transition-colors line-clamp-2">
                      {song.title}
                    </h4>
                  </div>

                  <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/5 text-xs">
                    <span className="text-muted truncate font-medium max-w-[150px]">{song.composer}</span>
                    <span className="text-muted/60 font-mono text-[10px] uppercase flex items-center gap-1 group-hover:text-text transition-colors">
                      {isLoading ? (
                        <>
                          Loading
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        </>
                      ) : (
                        <>
                          Load
                          <svg className="w-3 h-3 transform translate-x-0 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
