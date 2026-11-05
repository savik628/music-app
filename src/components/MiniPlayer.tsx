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
      className="mini-player-island p-2 rounded-2xl flex items-center justify-between cursor-pointer active:scale-[0.99] transition duration-200"
    >
      <div className="flex items-center gap-3 overflow-hidden flex-1">
        <div className="w-10 h-10 flex-shrink-0">
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
    </div>
  );
};
