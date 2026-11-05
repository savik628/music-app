import React, { useState, useEffect } from 'react';
import {
  FolderPlus,
  Disc3,
  Play,
  Trash2,
  ChevronRight,
  ArrowLeft,
  Check,
  Music,
  Plus,
  Folder,
} from 'lucide-react';
import type { Track, Playlist } from '../types';
import { getAllPlaylists, savePlaylist, deletePlaylist, removeTrackFromPlaylist } from '../db';
import { CoverImage } from './CoverImage';

interface AlbumsTabProps {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track) => void;
  onAddToAlbumRequest?: (track: Track) => void;
}

export const AlbumsTab: React.FC<AlbumsTabProps> = ({
  tracks,
  currentTrack,
  isPlaying,
  onPlayTrack,
}) => {
  const [subTab, setSubTab] = useState<'custom' | 'tags'>('custom');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<{
    id?: string;
    title: string;
    subtitle: string;
    tracks: Track[];
    isCustom?: boolean;
  } | null>(null);

  // Creation modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadPlaylists = async () => {
    const data = await getAllPlaylists();
    setPlaylists(data);
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  // Compute tag-based albums
  const tagAlbumsMap = tracks.reduce((acc, track) => {
    const key = track.album?.trim() || 'Неизвестный альбом';
    if (!acc[key]) acc[key] = [];
    acc[key].push(track);
    return acc;
  }, {} as Record<string, Track[]>);

  const tagAlbumsList = Object.keys(tagAlbumsMap).map((albumName) => ({
    title: albumName,
    tracks: tagAlbumsMap[albumName],
    artist: tagAlbumsMap[albumName][0]?.artist || 'Разные исполнители',
  }));

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    const newAlbum: Playlist = {
      id: `album_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: title,
      trackIds: Array.from(selectedTrackIds),
      createdAt: Date.now(),
    };

    await savePlaylist(newAlbum);
    await loadPlaylists();

    setIsCreateOpen(false);
    setNewTitle('');
    setSelectedTrackIds(new Set());
    showToast(`Альбом «${title}» успешно создан`);
  };

  const handleDeleteAlbum = async (id: string, name: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm(`Удалить альбом «${name}»? Сами треки останутся в медиатеке.`)) {
      await deletePlaylist(id);
      await loadPlaylists();
      if (activeAlbum?.id === id) {
        setActiveAlbum(null);
      }
      showToast('Альбом удален');
    }
  };

  const handleRemoveTrackFromActiveAlbum = async (trackId: string) => {
    if (!activeAlbum?.id) return;
    await removeTrackFromPlaylist(activeAlbum.id, trackId);
    await loadPlaylists();

    // Update current active album view
    setActiveAlbum((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        tracks: prev.tracks.filter((t) => t.id !== trackId),
      };
    });
    showToast('Трек убран из альбома');
  };

  const toggleSelectTrackForNew = (id: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDuration = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // If viewing a specific album's content
  if (activeAlbum) {
    const firstCover = activeAlbum.tracks.find((t) => t.coverBlob)?.coverBlob;

    return (
      <div className="space-y-4 pb-44 animate-in fade-in duration-200">
        {/* Back navigation & header */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setActiveAlbum(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-white transition py-1 px-2.5 bg-neutral-900 rounded-full"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад ко всем альбомам
          </button>

          {activeAlbum.isCustom && activeAlbum.id && (
            <button
              onClick={() => handleDeleteAlbum(activeAlbum.id!, activeAlbum.title)}
              className="text-neutral-500 hover:text-red-400 transition p-1.5"
              title="Удалить альбом"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Album Hero Info */}
        <div className="flex items-center gap-4 bg-gradient-to-b from-neutral-900/80 to-neutral-950/60 p-4 rounded-3xl border border-neutral-800/80">
          <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 shadow-2xl rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800">
            {firstCover ? (
              <CoverImage blob={firstCover} alt={activeAlbum.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-600 bg-neutral-900">
                <Disc3 className="w-10 h-10" />
              </div>
            )}
          </div>

          <div className="overflow-hidden flex-1">
            <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">
              {activeAlbum.isCustom ? 'Свой сборник' : 'Альбом'}
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-white truncate leading-tight mt-0.5">
              {activeAlbum.title}
            </h2>
            <p className="text-xs text-neutral-400 truncate mt-1">
              {activeAlbum.subtitle} • {activeAlbum.tracks.length} треков
            </p>

            {activeAlbum.tracks.length > 0 && (
              <button
                onClick={() => onPlayTrack(activeAlbum.tracks[0])}
                className="mt-3 flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-bold rounded-full active:scale-95 transition shadow-lg"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                Слушать альбом
              </button>
            )}
          </div>
        </div>

        {/* Tracks List */}
        <div className="space-y-1">
          {activeAlbum.tracks.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              <p className="text-sm font-medium">В этом альбоме пока нет треков</p>
              <p className="text-xs text-neutral-600 mt-1">
                Добавьте песни через список треков в медиатеке
              </p>
            </div>
          ) : (
            activeAlbum.tracks.map((track, idx) => {
              const isSelected = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => onPlayTrack(track)}
                  className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition ${
                    isSelected
                      ? 'bg-neutral-800/90 text-white border border-neutral-700/80 shadow'
                      : 'hover:bg-neutral-900/60 active:bg-neutral-900 text-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden mr-2">
                    <span className="w-4 text-[11px] font-mono text-neutral-500 text-right">
                      {idx + 1}
                    </span>
                    <div className="w-10 h-10 flex-shrink-0">
                      <CoverImage
                        blob={track.coverBlob}
                        alt={track.title}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-semibold truncate leading-tight text-white flex items-center gap-2">
                        {track.title}
                        {isSelected && isPlaying && (
                          <span className="flex items-end gap-0.5 h-3">
                            <span className="w-0.5 bg-white rounded-full eq-bar-1" />
                            <span className="w-0.5 bg-white rounded-full eq-bar-2" />
                            <span className="w-0.5 bg-white rounded-full eq-bar-3" />
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {formatDuration(track.duration)}
                    </span>
                    {activeAlbum.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTrackFromActiveAlbum(track.id);
                        }}
                        className="p-1.5 text-neutral-500 hover:text-red-400 transition"
                        title="Убрать из альбома"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-44">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-white text-black font-semibold text-xs px-4 py-2 rounded-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {toastMessage}
        </div>
      )}

      {/* Subtab Switcher & Add Custom Album Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex bg-neutral-900/90 p-1 rounded-full border border-neutral-800">
          <button
            onClick={() => setSubTab('custom')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
              subTab === 'custom'
                ? 'bg-white text-black shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Мои сборники ({playlists.length})
          </button>
          <button
            onClick={() => setSubTab('tags')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
              subTab === 'tags'
                ? 'bg-white text-black shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            По тегам ({tagAlbumsList.length})
          </button>
        </div>

        {subTab === 'custom' && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white active:scale-95 rounded-full text-xs font-bold transition border border-neutral-700/60"
          >
            <Plus className="w-3.5 h-3.5" />
            Новый альбом
          </button>
        )}
      </div>

      {/* User Custom Albums */}
      {subTab === 'custom' && (
        <>
          {playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-neutral-900/90 border border-neutral-800 flex items-center justify-center text-white mb-3 shadow-xl">
                <FolderPlus className="w-7 h-7" />
              </div>
              <p className="text-base font-bold text-white">Нет созданных альбомов</p>
              <p className="text-xs text-neutral-400 max-w-xs mt-1.5 mb-5 leading-relaxed">
                Вы можете формировать свои собственные альбомы и плейлисты из скачанных треков.
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="px-4 py-2 bg-white text-black rounded-full text-xs font-bold active:scale-95 transition shadow-lg flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Создать первый альбом
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {playlists.map((playlist) => {
                const albumTracks = playlist.trackIds
                  .map((id) => tracks.find((t) => t.id === id))
                  .filter((t): t is Track => Boolean(t));
                const firstCover = albumTracks.find((t) => t.coverBlob)?.coverBlob;

                return (
                  <div
                    key={playlist.id}
                    onClick={() =>
                      setActiveAlbum({
                        id: playlist.id,
                        title: playlist.name,
                        subtitle: 'Пользовательский альбом',
                        tracks: albumTracks,
                        isCustom: true,
                      })
                    }
                    className="cursor-pointer group space-y-2 bg-neutral-900/50 hover:bg-neutral-900/80 transition p-2.5 rounded-2xl border border-neutral-800/60 relative"
                  >
                    <div className="aspect-square w-full rounded-xl overflow-hidden shadow bg-neutral-950 flex items-center justify-center border border-neutral-850">
                      {firstCover ? (
                        <CoverImage
                          blob={firstCover}
                          alt={playlist.name}
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <Folder className="w-10 h-10 text-neutral-600" />
                      )}
                    </div>
                    <div className="px-1">
                      <h4 className="text-xs font-bold text-white truncate leading-tight">
                        {playlist.name}
                      </h4>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                        {albumTracks.length} треков
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ID3 Tag-Based Albums */}
      {subTab === 'tags' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tagAlbumsList.map((item) => {
            const firstCover = item.tracks.find((t) => t.coverBlob)?.coverBlob;

            return (
              <div
                key={item.title}
                onClick={() =>
                  setActiveAlbum({
                    title: item.title,
                    subtitle: item.artist,
                    tracks: item.tracks,
                    isCustom: false,
                  })
                }
                className="cursor-pointer group space-y-2 bg-neutral-900/50 hover:bg-neutral-900/80 transition p-2.5 rounded-2xl border border-neutral-800/60"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden shadow bg-neutral-950 flex items-center justify-center">
                  {firstCover ? (
                    <CoverImage
                      blob={firstCover}
                      alt={item.title}
                      className="w-full h-full object-cover rounded-xl"
                    />
                  ) : (
                    <Disc3 className="w-10 h-10 text-neutral-600" />
                  )}
                </div>
                <div className="px-1">
                  <h4 className="text-xs font-bold text-white truncate leading-tight">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                    {item.artist} • {item.tracks.length} треков
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Album */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-3 animate-in fade-in duration-150">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-md p-5 space-y-4 max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Новый альбом</h3>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  setNewTitle('');
                  setSelectedTrackIds(new Set());
                }}
                className="text-xs text-neutral-400 hover:text-white"
              >
                Отмена
              </button>
            </div>

            <form onSubmit={handleCreateAlbum} className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                  Название альбома
                </label>
                <input
                  type="text"
                  placeholder="Например: Любимое в дорогу"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                  required
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                />
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Выберите треки ({selectedTrackIds.size})
                  </span>
                  {tracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedTrackIds.size === tracks.length) {
                          setSelectedTrackIds(new Set());
                        } else {
                          setSelectedTrackIds(new Set(tracks.map((t) => t.id)));
                        }
                      }}
                      className="text-[11px] text-neutral-400 hover:text-white underline"
                    >
                      {selectedTrackIds.size === tracks.length ? 'Снять все' : 'Выбрать все'}
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 pr-1 border border-neutral-850 rounded-xl p-2 bg-neutral-950/60 max-h-56">
                  {tracks.length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-6">
                      В медиатеке нет треков для добавления
                    </p>
                  ) : (
                    tracks.map((track) => {
                      const isChecked = selectedTrackIds.has(track.id);
                      return (
                        <div
                          key={track.id}
                          onClick={() => toggleSelectTrackForNew(track.id)}
                          className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition ${
                            isChecked ? 'bg-neutral-800 text-white' : 'hover:bg-neutral-900 text-neutral-400'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden mr-2">
                            <div className="w-8 h-8 flex-shrink-0">
                              <CoverImage
                                blob={track.coverBlob}
                                alt={track.title}
                                className="w-full h-full object-cover rounded-lg"
                              />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-semibold truncate leading-tight text-white">
                                {track.title}
                              </p>
                              <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                                {track.artist}
                              </p>
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition ${
                              isChecked
                                ? 'bg-white border-white text-black'
                                : 'border-neutral-700 bg-neutral-900'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="w-full py-3 bg-white text-black font-bold rounded-xl text-xs active:scale-98 transition disabled:opacity-40 shadow-lg"
              >
                Создать альбом
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
