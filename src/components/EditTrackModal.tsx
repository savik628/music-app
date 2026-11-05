import React, { useState, useRef } from 'react';
import { X, Camera, Sparkles, Check, Loader2 } from 'lucide-react';
import type { Track } from '../types';
import { updateTrackMetadata } from '../db';
import { searchCoverOnline } from '../coverService';
import { CoverImage } from './CoverImage';

interface EditTrackModalProps {
  track: Track;
  onClose: () => void;
  onSaved: () => void;
}

export const EditTrackModal: React.FC<EditTrackModalProps> = ({ track, onClose, onSaved }) => {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [coverBlob, setCoverBlob] = useState<Blob | undefined>(track.coverBlob);
  const [isSearchingCover, setIsSearchingCover] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setCoverBlob(file);
    }
  };

  const handleSearchOnlineCover = async () => {
    if (!title && !artist) return;
    setIsSearchingCover(true);
    try {
      const found = await searchCoverOnline(artist, title);
      if (found) {
        setCoverBlob(found);
      } else {
        alert('Обложка не найдена в онлайн-каталогах');
      }
    } catch {
      alert('Ошибка при поиске обложки');
    } finally {
      setIsSearchingCover(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateTrackMetadata(track.id, {
        title: title.trim() || track.title,
        artist: artist.trim() || track.artist,
        album: album.trim() || track.album,
        coverBlob,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to update track:', err);
      alert('Не удалось сохранить изменения');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <h3 className="text-base font-bold text-white">Редактировать трек</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          {/* Cover Art Preview & Upload */}
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-neutral-800 border border-neutral-700/80 flex-shrink-0 group">
              <CoverImage blob={coverBlob} alt={title} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-[10px] text-white transition cursor-pointer"
              >
                <Camera className="w-5 h-5 mb-0.5" />
                Сменить
              </button>
            </div>

            <div className="flex-1 space-y-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 bg-neutral-800 hover:bg-neutral-700 active:scale-98 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition border border-neutral-700/60"
              >
                <Camera className="w-3.5 h-3.5" />
                Выбрать из галереи
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={handleSearchOnlineCover}
                disabled={isSearchingCover}
                className="w-full py-2 px-3 bg-neutral-800/60 hover:bg-neutral-800 active:scale-98 rounded-xl text-xs font-semibold text-neutral-300 flex items-center justify-center gap-1.5 transition border border-neutral-700/40 disabled:opacity-50"
              >
                {isSearchingCover ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                )}
                Найти обложку в сети
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
              Название трека
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
              Исполнитель
            </label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
              Альбом
            </label>
            <input
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-white/40"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 active:scale-98 rounded-xl text-xs font-bold text-neutral-300 transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3 bg-white text-black active:scale-98 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
