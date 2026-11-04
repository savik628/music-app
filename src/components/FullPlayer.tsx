import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Volume2, Shuffle, Repeat } from 'lucide-react';
import type { Track } from '../types';
import { CoverImage } from './CoverImage';
import { audioEngine } from '../audio';

interface FullPlayerProps {
  track: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  isShuffle: boolean;
  toggleShuffle: () => void;
  isRepeat: boolean;
  toggleRepeat: () => void;
}

export const FullPlayer: React.FC<FullPlayerProps> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  onClose,
  onNext,
  onPrev,
  isShuffle,
  toggleShuffle,
  isRepeat,
  toggleRepeat,
}) => {
  const [volume, setVolume] = useState(1);

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    audioEngine.seek(val);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    audioEngine.setVolume(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white px-6 pt-safe pb-safe animate-in fade-in slide-in-from-bottom duration-200">
      {/* Top Handle / Close */}
      <div className="flex items-center justify-between mb-2 pt-2">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-neutral-400 active:text-white"
        >
          <ChevronDown className="w-7 h-7" />
        </button>
        <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-bold">
          Сейчас играет
        </span>
        <div className="w-7" />
      </div>

      {/* Album Cover Art */}
      <div className="flex-1 flex items-center justify-center my-3">
        <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl">
          <CoverImage blob={track.coverBlob} alt={track.title} className="w-full h-full object-cover rounded-2xl" />
        </div>
      </div>

      {/* Track Info */}
      <div className="flex items-center justify-between mb-4">
        <div className="overflow-hidden pr-4">
          <h2 className="text-xl sm:text-2xl font-bold truncate tracking-tight text-white">{track.title}</h2>
          <p className="text-neutral-400 text-sm sm:text-base truncate mt-0.5">{track.artist}</p>
        </div>
      </div>

      {/* Timeline Slider */}
      <div className="space-y-1.5 mb-5">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
        />
        <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-between px-3 mb-6">
        <button
          onClick={toggleShuffle}
          className={`p-2 rounded-full transition ${isShuffle ? 'text-white font-bold' : 'text-neutral-500'}`}
        >
          <Shuffle className="w-5 h-5" />
        </button>

        <button
          onClick={onPrev}
          className="p-3 text-neutral-300 active:scale-95 transition"
        >
          <SkipBack className="w-8 h-8 fill-current" />
        </button>

        <button
          onClick={() => audioEngine.togglePlay()}
          className="p-5 bg-white text-black rounded-full shadow-lg active:scale-95 transition"
        >
          {isPlaying ? (
            <Pause className="w-8 h-8 fill-current" />
          ) : (
            <Play className="w-8 h-8 fill-current translate-x-0.5" />
          )}
        </button>

        <button
          onClick={onNext}
          className="p-3 text-neutral-300 active:scale-95 transition"
        >
          <SkipForward className="w-8 h-8 fill-current" />
        </button>

        <button
          onClick={toggleRepeat}
          className={`p-2 rounded-full transition ${isRepeat ? 'text-white font-bold' : 'text-neutral-500'}`}
        >
          <Repeat className="w-5 h-5" />
        </button>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-3 px-3 pb-4">
        <Volume2 className="w-4 h-4 text-neutral-500" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolume}
          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
        />
      </div>
    </div>
  );
};
