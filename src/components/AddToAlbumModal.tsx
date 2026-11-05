import React, { useState, useEffect } from 'react';
import { FolderPlus, Plus, Check, X, Folder } from 'lucide-react';
import type { Track, Playlist } from '../types';
import { getAllPlaylists, savePlaylist, addTrackToPlaylist } from '../db';

interface AddToAlbumModalProps {
  track: Track;
  onClose: () => void;
  onAdded: (albumName: string) => void;
}

export const AddToAlbumModal: React.FC<AddToAlbumModalProps> = ({
  track,
  onClose,
  onAdded,
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');

  const loadPlaylists = async () => {
    const list = await getAllPlaylists();
    setPlaylists(list);
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  const handleSelectPlaylist = async (playlist: Playlist) => {
    await addTrackToPlaylist(playlist.id, track.id);
    onAdded(playlist.name);
    onClose();
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newAlbumTitle.trim();
    if (!title) return;

    const newAlbum: Playlist = {
      id: `album_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: title,
      trackIds: [track.id],
      createdAt: Date.now(),
    };

    await savePlaylist(newAlbum);
    onAdded(title);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-3 animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="overflow-hidden pr-2">
            <h3 className="text-base font-bold text-white leading-tight">Добавить в альбом</h3>
            <p className="text-xs text-neutral-400 truncate mt-0.5">{track.title} • {track.artist}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-full bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isCreatingNew ? (
          <div className="space-y-3">
            <button
              onClick={() => setIsCreatingNew(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white text-black font-bold text-xs rounded-xl active:scale-98 transition shadow"
            >
              <Plus className="w-4 h-4 text-black" />
              Создать новый альбом
            </button>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {playlists.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-4">
                  Нет альбомов. Нажмите кнопку выше, чтобы создать.
                </p>
              ) : (
                playlists.map((pl) => {
                  const alreadyIn = pl.trackIds.includes(track.id);
                  return (
                    <button
                      key={pl.id}
                      onClick={() => !alreadyIn && handleSelectPlaylist(pl)}
                      disabled={alreadyIn}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition ${
                        alreadyIn
                          ? 'bg-neutral-950/60 text-neutral-500 cursor-default border border-neutral-850'
                          : 'bg-neutral-950 hover:bg-neutral-800 text-white border border-neutral-800 active:scale-98'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <Folder className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                        <span className="text-xs font-semibold truncate">{pl.name}</span>
                      </div>
                      {alreadyIn ? (
                        <span className="text-[10px] text-neutral-500 font-medium">Уже добавлен</span>
                      ) : (
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {pl.trackIds.length} тр.
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateAndAdd} className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                Название нового альбома
              </label>
              <input
                type="text"
                placeholder="Мой сборник..."
                value={newAlbumTitle}
                onChange={(e) => setNewAlbumTitle(e.target.value)}
                autoFocus
                required
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs rounded-xl transition"
              >
                Назад
              </button>
              <button
                type="submit"
                disabled={!newAlbumTitle.trim()}
                className="flex-1 py-2.5 bg-white text-black font-bold text-xs rounded-xl active:scale-98 transition disabled:opacity-40"
              >
                Создать и добавить
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
