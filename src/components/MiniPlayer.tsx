import React from 'react';
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
  return (
    <div
      onClick={onOpen}
      className="mx-3 mb-20 p-2 bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-between shadow-2xl cursor-pointer active:scale-[0.99] transition duration-200"
    >
      <div className="flex items-center gap-3 overflow-hidden flex-1">
        <div className="w-11 h-11 flex-shrink-0">
          <CoverImage blob={track.coverBlob} alt={track.title} className="w-full h-full object-cover rounded-xl" />
        </div>
        <div className="overflow-hidden pr-2">
          <p className="text-sm font-semibold truncate text-white">{track.title}</p>
          <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 pr-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            audioEngine.togglePlay();
          }}
          className="p-2 text-white active:scale-90 transition"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 fill-current" />
          ) : (
            <Play className="w-6 h-6 fill-current" />
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="p-2 text-neutral-400 active:text-white active:scale-90 transition"
        >
          <SkipForward className="w-6 h-6 fill-current" />
        </button>
      </div>
    </div>
  );
};
