import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Library,
  Search,
  Plus,
  Heart,
  Music,
  Trash2,
  Disc3,
  User,
  Loader2,
  FolderPlus,
  Sparkles,
  Pencil,
  ArrowUpDown,
  X,
  ShieldCheck,
} from 'lucide-react';
import type { Track } from './types';
import {
  getAllTracks,
  saveTrack,
  deleteTrack,
  toggleFavorite,
  requestPersistentStorage,
  getStorageEstimate,
} from './db';
import { parseAudioFile } from './parser';
import { audioEngine } from './audio';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayer } from './components/FullPlayer';
import { CoverImage } from './components/CoverImage';
import { SearchTab } from './components/SearchTab';
import { AlbumsTab } from './components/AlbumsTab';
import { AddToAlbumModal } from './components/AddToAlbumModal';
import { EditTrackModal } from './components/EditTrackModal';
import { searchCoverOnline } from './coverService';

export function App() {
  const [activeTab, setActiveTab] = useState<'library' | 'albums' | 'artists' | 'search'>('library');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  // Library Search & Sort state
  const [libraryQuery, setLibraryQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title' | 'artist' | 'duration'>('newest');
  const [storageInfo, setStorageInfo] = useState<{ usedMb: number; isPersisted: boolean } | null>(null);

  // Playback & Queue state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [activeQueue, setActiveQueue] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Modals & Toast state
  const [trackForAlbumModal, setTrackForAlbumModal] = useState<Track | null>(null);
  const [trackForEdit, setTrackForEdit] = useState<Track | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const stateRef = useRef({ tracks, currentTrack, activeQueue, isShuffle, isRepeat });
  stateRef.current = { tracks, currentTrack, activeQueue, isShuffle, isRepeat };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const refreshLibrary = async () => {
    try {
      const data = await getAllTracks();
      setTracks(data);

      const est = await getStorageEstimate();
      setStorageInfo({
        usedMb: Math.round(est.usedBytes / (1024 * 1024)),
        isPersisted: est.isPersisted,
      });
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  // Request permanent storage on mount so iOS Safari never wipes IndexedDB
  useEffect(() => {
    requestPersistentStorage();
    refreshLibrary();

    const unsubscribe = audioEngine.subscribe(() => {
      const state = audioEngine.getState();
      setCurrentTrack(state.track);
      setIsPlaying(state.isPlaying);
      setCurrentTime(state.currentTime);
      setDuration(state.duration);
    });

    audioEngine.onTrackEnded = () => {
      handleNextTrack(true);
    };

    audioEngine.setMediaSessionActions(
      () => handlePrevTrack(),
      () => handleNextTrack()
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Filter and sort tracks in Library
  const filteredAndSortedTracks = useMemo(() => {
    let result = [...tracks];

    // Search query filter
    const q = libraryQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album && t.album.toLowerCase().includes(q))
      );
    }

    // Sort order
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => b.addedAt - a.addedAt);
        break;
      case 'oldest':
        result.sort((a, b) => a.addedAt - b.addedAt);
        break;
      case 'title':
        result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
        break;
      case 'artist':
        result.sort((a, b) => a.artist.localeCompare(b.artist, 'ru'));
        break;
      case 'duration':
        result.sort((a, b) => b.duration - a.duration);
        break;
    }

    return result;
  }, [tracks, libraryQuery, sortBy]);

  // Keep AudioEngine next track preloaded for seamless background transition
  useEffect(() => {
    const queue = activeQueue.length > 0 ? activeQueue : tracks;
    if (queue.length === 0 || !currentTrack) {
      audioEngine.setNextTrack(null);
      return;
    }

    if (isRepeat) {
      audioEngine.setNextTrack(currentTrack);
      return;
    }

    if (isShuffle) {
      if (queue.length > 1) {
        const others = queue.filter((t) => t.id !== currentTrack.id);
        const randomNext = others[Math.floor(Math.random() * others.length)];
        audioEngine.setNextTrack(randomNext);
      } else {
        audioEngine.setNextTrack(queue[0]);
      }
      return;
    }

    const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % queue.length;
    audioEngine.setNextTrack(queue[nextIndex]);
  }, [currentTrack, activeQueue, tracks, isShuffle, isRepeat]);

  // Playback handlers with contextual queue
  const handlePlayTrack = (track: Track, queueContext?: Track[]) => {
    const queue = queueContext || (activeQueue.length > 0 ? activeQueue : filteredAndSortedTracks);
    setActiveQueue(queue);
    audioEngine.playTrack(track);
  };

  const handleNextTrack = (fromEnded: boolean = false) => {
    const { tracks, currentTrack, activeQueue, isShuffle, isRepeat } = stateRef.current;
    const queue = activeQueue.length > 0 ? activeQueue : tracks;
    if (queue.length === 0) return;

    if (isRepeat && fromEnded && currentTrack) {
      audioEngine.playTrack(currentTrack);
      return;
    }

    if (isShuffle) {
      if (queue.length > 1 && currentTrack) {
        const otherTracks = queue.filter((t) => t.id !== currentTrack.id);
        const randomIndex = Math.floor(Math.random() * otherTracks.length);
        audioEngine.playTrack(otherTracks[randomIndex]);
      } else {
        audioEngine.playTrack(queue[0]);
      }
      return;
    }

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % queue.length;
    audioEngine.playTrack(queue[nextIndex]);
  };

  const handlePrevTrack = () => {
    const { tracks, currentTrack, activeQueue } = stateRef.current;
    const queue = activeQueue.length > 0 ? activeQueue : tracks;
    if (queue.length === 0) return;

    if (audioEngine.getState().currentTime > 3) {
      audioEngine.seek(0);
      return;
    }

    const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = currentIndex === -1 ? 0 : (currentIndex - 1 + queue.length) % queue.length;
    audioEngine.playTrack(queue[prevIndex]);
  };

  // Handle local files import (iOS Safari friendly)
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setImporting(true);
    let addedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isAudio =
        file.type.startsWith('audio/') ||
        !file.type ||
        /\.(mp3|m4a|aac|wav|flac|ogg|mp4|aiff)$/i.test(file.name);

      if (isAudio) {
        try {
          const parsed = await parseAudioFile(file);
          if (!parsed.coverBlob) {
            try {
              const cover = await searchCoverOnline(parsed.artist, parsed.title);
              if (cover) parsed.coverBlob = cover;
            } catch {}
          }
          await saveTrack(parsed);
          addedCount++;
        } catch (err) {
          console.error('Error importing file:', file.name, err);
        }
      }
    }

    await refreshLibrary();
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (addedCount > 0) {
      setActiveTab('library');
      showToast(`Добавлено треков: ${addedCount}`);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Удалить этот трек из памяти?')) {
      await deleteTrack(id);
      if (currentTrack?.id === id) {
        audioEngine.pause();
        setCurrentTrack(null);
      }
      refreshLibrary();
      showToast('Трек удален');
    }
  };

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleFavorite(id);
    refreshLibrary();
  };

  const handleFindCover = async (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    showToast('Поиск заставки в сети...');
    try {
      const cover = await searchCoverOnline(track.artist, track.title);
      if (cover) {
        track.coverBlob = cover;
        await saveTrack(track);
        await refreshLibrary();
        showToast('Заставка найдена и сохранена!');
      } else {
        showToast('Заставка не найдена');
      }
    } catch {
      showToast('Ошибка поиска заставки');
    }
  };

  // Artists grouping
  const artistsMap = tracks.reduce((acc, track) => {
    const key = track.artist?.trim() || 'Неизвестный исполнитель';
    if (!acc[key]) acc[key] = [];
    acc[key].push(track);
    return acc;
  }, {} as Record<string, Track[]>);

  const formatDuration = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const renderedLibrary = useMemo(() => {
    if (tracks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white mb-4 shadow-xl">
            <Music className="w-8 h-8" />
          </div>
          <p className="text-base font-bold text-white">Медиатека пуста</p>
          <p className="text-xs text-neutral-400 max-w-xs mt-1.5 mb-6 leading-relaxed">
            Нажмите «Добавить музыку», чтобы выбрать аудиофайлы с телефона/ПК, или найдите и скачайте треки во вкладке «Поиск».
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 bg-white text-black rounded-full text-xs font-bold active:scale-95 transition shadow-lg"
          >
            Выбрать файлы
          </button>
        </div>
      );
    }

    if (filteredAndSortedTracks.length === 0) {
      return (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-sm font-semibold">Ничего не найдено</p>
          <p className="text-xs text-neutral-600 mt-1">По запросу «{libraryQuery}» нет треков</p>
          <button
            onClick={() => setLibraryQuery('')}
            className="mt-3 px-3 py-1.5 bg-neutral-900 text-xs text-neutral-400 rounded-full"
          >
            Сбросить фильтр
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {filteredAndSortedTracks.map((track) => {
          const isSelected = currentTrack?.id === track.id;
          return (
            <div
              key={track.id}
              onClick={() => handlePlayTrack(track, filteredAndSortedTracks)}
              className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition ${
                isSelected
                  ? 'bg-neutral-800/90 text-white border border-neutral-700/80 shadow'
                  : 'hover:bg-neutral-900/60 active:bg-neutral-900 text-neutral-300'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden mr-2">
                <div className="w-11 h-11 flex-shrink-0">
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
                  <p className="text-xs text-neutral-400 truncate mt-0.5">
                    {track.artist} {track.album ? `• ${track.album}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[11px] text-neutral-500 font-mono pr-1">
                  {formatDuration(track.duration)}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTrackForEdit(track);
                  }}
                  className="p-1.5 text-neutral-500 hover:text-white transition"
                  title="Редактировать"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {!track.coverBlob && (
                  <button
                    onClick={(e) => handleFindCover(track, e)}
                    className="p-1.5 text-neutral-400 hover:text-white transition"
                    title="Найти заставку в сети"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTrackForAlbumModal(track);
                  }}
                  className="p-1.5 text-neutral-400 hover:text-white transition"
                  title="В альбом"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={(e) => handleToggleFavorite(track.id, e)}
                  className={`p-1.5 transition ${
                    track.isFavorite ? 'text-white' : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${track.isFavorite ? 'fill-current' : ''}`} />
                </button>

                <button
                  onClick={(e) => handleDelete(track.id, e)}
                  className="p-1.5 text-neutral-500 hover:text-white transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [tracks, filteredAndSortedTracks, libraryQuery, currentTrack?.id, isPlaying]);

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-white text-black font-semibold text-xs px-4 py-2 rounded-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {toastMsg}
        </div>
      )}

      {/* Top Header (VIV Header architecture) */}
      <header className="app-header">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white leading-none">
            {activeTab === 'library' && 'Медиатека'}
            {activeTab === 'albums' && 'Альбомы'}
            {activeTab === 'artists' && 'Артисты'}
            {activeTab === 'search' && 'Поиск'}
          </h1>
          <p className="text-[11px] text-neutral-400 font-medium mt-0.5">Офлайн плеер</p>
        </div>

        {/* Add music button */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.aac,.wav,.flac"
            ref={fileInputRef}
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-black active:scale-95 rounded-full text-xs font-bold shadow-md transition disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
            ) : (
              <Plus className="w-3.5 h-3.5 text-black" />
            )}
            <span>Добавить</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="screen-content">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
          </div>
        ) : (
          <>
            {/* Library Tab with Search & Sorting */}
            {activeTab === 'library' && (
              <div className="space-y-3">
                {/* Search Bar & Storage info */}
                {tracks.length > 0 && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Поиск по своим трекам..."
                        value={libraryQuery}
                        onChange={(e) => setLibraryQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition"
                      />
                      {libraryQuery && (
                        <button
                          onClick={() => setLibraryQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Filter / Sort Row */}
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 px-0.5">
                      <div className="flex items-center gap-1">
                        <ArrowUpDown className="w-3 h-3 text-neutral-500" />
                        <select
                          value={sortBy}
                          onChange={(e: any) => setSortBy(e.target.value)}
                          className="bg-transparent text-neutral-300 font-semibold focus:outline-none cursor-pointer"
                        >
                          <option value="newest" className="bg-neutral-900">Новые сначала</option>
                          <option value="oldest" className="bg-neutral-900">Старые сначала</option>
                          <option value="title" className="bg-neutral-900">По названию (А-Я)</option>
                          <option value="artist" className="bg-neutral-900">По артисту (А-Я)</option>
                          <option value="duration" className="bg-neutral-900">По длительности</option>
                        </select>
                      </div>

                      {storageInfo && (
                        <div className="flex items-center gap-1 font-mono text-[10px] text-neutral-500">
                          {storageInfo.isPersisted && <ShieldCheck className="w-3 h-3 text-emerald-400" />}
                          <span>{tracks.length} треков • {storageInfo.usedMb} МБ</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {renderedLibrary}
              </div>
            )}

            {/* Albums Tab */}
            {activeTab === 'albums' && (
              <AlbumsTab
                tracks={tracks}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                onPlayTrack={handlePlayTrack}
              />
            )}

            {/* Artists Tab */}
            {activeTab === 'artists' && (
              <div className="space-y-2">
                {Object.keys(artistsMap).length === 0 ? (
                  <p className="text-xs text-neutral-500 text-center py-12">Нет исполнителей</p>
                ) : (
                  Object.keys(artistsMap).map((artistName) => {
                    const artistTracks = artistsMap[artistName];
                    return (
                      <div
                        key={artistName}
                        onClick={() => handlePlayTrack(artistTracks[0], artistTracks)}
                        className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-900/60 hover:bg-neutral-900 transition cursor-pointer border border-neutral-800/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-white">
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{artistName}</p>
                            <p className="text-xs text-neutral-400">{artistTracks.length} треков</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Search Tab */}
            {activeTab === 'search' && (
              <SearchTab onTrackDownloaded={refreshLibrary} />
            )}
          </>
        )}
      </main>

      {/* Unified Bottom Dock: Holds MiniPlayer and TabBar in a single aligned stack */}
      <div className="bottom-dock">
        {currentTrack && !isFullPlayerOpen && (
          <div className="mini-player-wrapper animate-in slide-in-from-bottom-2 duration-150">
            <MiniPlayer
              track={currentTrack}
              isPlaying={isPlaying}
              onOpen={() => setIsFullPlayerOpen(true)}
              onNext={() => handleNextTrack()}
            />
          </div>
        )}

        <nav className="bottom-nav">
          <button
            onClick={() => setActiveTab('library')}
            className={`nav-item ${activeTab === 'library' ? 'active' : ''}`}
          >
            <div className="nav-icon">
              <Library className="w-5 h-5" />
            </div>
            <span>Медиатека</span>
          </button>

          <button
            onClick={() => setActiveTab('albums')}
            className={`nav-item ${activeTab === 'albums' ? 'active' : ''}`}
          >
            <div className="nav-icon">
              <Disc3 className="w-5 h-5" />
            </div>
            <span>Альбомы</span>
          </button>

          <button
            onClick={() => setActiveTab('artists')}
            className={`nav-item ${activeTab === 'artists' ? 'active' : ''}`}
          >
            <div className="nav-icon">
              <User className="w-5 h-5" />
            </div>
            <span>Артисты</span>
          </button>

          <button
            onClick={() => setActiveTab('search')}
            className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
          >
            <div className="nav-icon">
              <Search className="w-5 h-5" />
            </div>
            <span>Поиск</span>
          </button>
        </nav>
      </div>

      {/* Modal: Add Track to Custom Album */}
      {trackForAlbumModal && (
        <AddToAlbumModal
          track={trackForAlbumModal}
          onClose={() => setTrackForAlbumModal(null)}
          onAdded={(albumName) => {
            showToast(`Добавлено в «${albumName}»`);
            refreshLibrary();
          }}
        />
      )}

      {/* Modal: Edit Track Metadata & Cover */}
      {trackForEdit && (
        <EditTrackModal
          track={trackForEdit}
          onClose={() => setTrackForEdit(null)}
          onSaved={() => {
            showToast('Трек обновлен');
            refreshLibrary();
            if (currentTrack?.id === trackForEdit.id) {
              getAllTracks().then((list) => {
                const updated = list.find((t) => t.id === trackForEdit.id);
                if (updated) setCurrentTrack(updated);
              });
            }
          }}
        />
      )}

      {/* Fullscreen Player Modal */}
      {currentTrack && isFullPlayerOpen && (
        <FullPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onClose={() => setIsFullPlayerOpen(false)}
          onNext={() => handleNextTrack()}
          onPrev={() => handlePrevTrack()}
          isShuffle={isShuffle}
          toggleShuffle={() => setIsShuffle(!isShuffle)}
          isRepeat={isRepeat}
          toggleRepeat={() => setIsRepeat(!isRepeat)}
        />
      )}
    </div>
  );
}

export default App;
