import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';
import type { Track } from '../types';
import { CoverImage } from './CoverImage';
import { audioEngine } from '../audio';

interface MiniPlayerProps {
  track: Track;
  isPlaying: boolean;
  onOpen: () => void;
  onNext: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  track,
  isPlaying,
  onOpen,
  onNext,
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const unsub = audioEngine.subscribe(() => {
      const state = audioEngine.getState();
      if (state.duration > 0) {
        setProgress(Math.min(100, Math.max(0, (state.currentTime / state.duration) * 100)));
      }
    });
    return () => unsub();
  }, [track]);

  return (
    <div
      onClick={onOpen}
      className="mini-player-island relative p-2 rounded-2xl flex items-center justify-between cursor-pointer active:scale-[0.99] transition duration-200 overflow-hidden"
    >
      <div className="flex items-center gap-3 overflow-hidden flex-1">
        <div className="w-10 h-10 flex-shrink-0 shadow-md">
          <CoverImage blob={track.coverBlob} alt={track.title} className="w-full h-full object-cover rounded-xl" />
        </div>
        <div className="overflow-hidden pr-2">
          <p className="text-sm font-semibold truncate text-white leading-tight">{track.title}</p>
          <p className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0 pr-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            audioEngine.togglePlay();
          }}
          className="p-2 text-white active:scale-90 transition"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current translate-x-0.5" />
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="p-2 text-neutral-400 active:text-white active:scale-90 transition"
        >
          <SkipForward className="w-5 h-5 fill-current" />
        </button>
      </div>

      {/* Apple Music subtle progress bar */}
      <div className="absolute bottom-0 left-2 right-2 h-[1.5px] bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/90 rounded-full transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
