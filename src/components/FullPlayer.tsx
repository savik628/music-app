import React, { useState, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Volume2, Shuffle, Repeat, X } from 'lucide-react';
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
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef<number | null>(null);

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

  // Swipe-down to dismiss gesture
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - touchStartY.current;
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const onTouchEnd = () => {
    if (dragY > 40) {
      onClose();
    }
    setDragY(0);
    touchStartY.current = null;
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none',
      }}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white px-6 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-[calc(env(safe-area-inset-bottom,0px)+16px)] overflow-y-auto"
    >
      {/* Top Handle Grabber - Tap or Swipe down to close */}
      <div
        onClick={onClose}
        className="w-full flex items-center justify-center py-2.5 -mt-1 mb-1 cursor-pointer touch-none"
        aria-label="Свернуть плеер"
      >
        <div className="w-14 h-1.5 bg-neutral-500 hover:bg-neutral-400 rounded-full transition" />
      </div>

      {/* Header Bar */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700/80 flex items-center justify-center text-white active:scale-90 transition shadow"
          title="Свернуть"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-bold">
          Сейчас играет
        </span>

        <button
          onClick={onClose}
          className="px-3.5 py-1.5 bg-neutral-900 border border-neutral-700/80 rounded-full text-xs font-bold text-neutral-200 active:scale-95 transition flex items-center gap-1 shadow"
        >
          <X className="w-3.5 h-3.5" />
          <span>Закрыть</span>
        </button>
      </div>

      {/* Album Cover Art */}
      <div className="flex-1 flex items-center justify-center my-3 min-h-0">
        <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl bg-neutral-900">
          <CoverImage blob={track.coverBlob} alt={track.title} className="w-full h-full object-cover rounded-3xl" />
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
      <div className="flex items-center justify-between mb-6 px-4">
        <button
          onClick={toggleShuffle}
          className={`p-2 transition ${isShuffle ? 'text-white' : 'text-neutral-600'}`}
        >
          <Shuffle className="w-5 h-5" />
        </button>

        <button onClick={onPrev} className="p-2 text-white active:scale-90 transition">
          <SkipBack className="w-7 h-7 fill-current" />
        </button>

        <button
          onClick={() => audioEngine.togglePlay()}
          className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition shadow-xl"
        >
          {isPlaying ? (
            <Pause className="w-7 h-7 fill-current text-black" />
          ) : (
            <Play className="w-7 h-7 fill-current text-black translate-x-0.5" />
          )}
        </button>

        <button onClick={onNext} className="p-2 text-white active:scale-90 transition">
          <SkipForward className="w-7 h-7 fill-current" />
        </button>

        <button
          onClick={toggleRepeat}
          className={`p-2 transition ${isRepeat ? 'text-white' : 'text-neutral-600'}`}
        >
          <Repeat className="w-5 h-5" />
        </button>
      </div>

      {/* Hardware-Independent Software Volume (iOS Web Audio API GainNode) */}
      <div className="flex items-center gap-3 px-4 pb-2">
        <Volume2 className="w-4 h-4 text-neutral-400" />
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

      {/* Quick One-Handed Dismiss Button */}
      <button
        onClick={onClose}
        className="w-full mt-2 py-3 bg-neutral-900 hover:bg-neutral-800 active:scale-98 border border-neutral-800 rounded-2xl text-xs font-semibold text-neutral-300 flex items-center justify-center gap-1.5 transition"
      >
        <ChevronDown className="w-4 h-4" />
        <span>Свернуть плеер</span>
      </button>
    </div>
  );
};
