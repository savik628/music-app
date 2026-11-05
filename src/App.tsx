import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import type { Track } from './types';
import { getAllTracks, saveTrack, deleteTrack, toggleFavorite } from './db';
import { parseAudioFile } from './parser';
import { audioEngine } from './audio';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayer } from './components/FullPlayer';
import { CoverImage } from './components/CoverImage';
import { SearchTab } from './components/SearchTab';
import { AlbumsTab } from './components/AlbumsTab';
import { AddToAlbumModal } from './components/AddToAlbumModal';
import { searchCoverOnline } from './coverService';

export function App() {
  const [activeTab, setActiveTab] = useState<'library' | 'albums' | 'artists' | 'search'>('library');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  // Player state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Modal / Toast state
  const [trackForAlbumModal, setTrackForAlbumModal] = useState<Track | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const refreshLibrary = async () => {
    try {
      const data = await getAllTracks();
      setTracks(data);
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshLibrary();

    const unsubscribe = audioEngine.subscribe(() => {
      const state = audioEngine.getState();
      setCurrentTrack(state.track);
      setIsPlaying(state.isPlaying);
      setCurrentTime(state.currentTime);
      setDuration(state.duration);
    });

    audioEngine.onTrackEnded = () => {
      handleNextTrack();
    };

    audioEngine.setMediaSessionActions(
      () => handlePrevTrack(),
      () => handleNextTrack()
    );

    return () => unsubscribe();
  }, [tracks, currentTrack, isShuffle, isRepeat]);

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
          // If track has no cover, automatically search online
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

  // Playback handlers
  const handlePlayTrack = (track: Track) => {
    audioEngine.playTrack(track);
  };

  const handleNextTrack = () => {
    if (tracks.length === 0) return;
    if (isRepeat && currentTrack) {
      audioEngine.playTrack(currentTrack);
      return;
    }
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      audioEngine.playTrack(tracks[randomIndex]);
      return;
    }
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    audioEngine.playTrack(tracks[nextIndex]);
  };

  const handlePrevTrack = () => {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    audioEngine.playTrack(tracks[prevIndex]);
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

  return (
    <div className="flex flex-col h-full w-full bg-black text-white overflow-hidden relative">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-white text-black font-semibold text-xs px-4 py-2 rounded-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {toastMsg}
        </div>
      )}

      {/* Top Header - Apple Music Style */}
      <header className="apple-header px-5 pt-safe pb-2.5 flex items-center justify-between flex-shrink-0 z-20">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white leading-none">
            {activeTab === 'library' && 'Медиатека'}
            {activeTab === 'albums' && 'Альбомы'}
            {activeTab === 'artists' && 'Артисты'}
            {activeTab === 'search' && 'Поиск'}
          </h1>
          <p className="text-[11px] text-neutral-400 font-medium mt-1">Офлайн плеер</p>
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
            Добавить музыку
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-3 pb-[calc(110px+env(safe-area-inset-bottom,0px))]">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          </div>
        ) : (
          <>
            {/* Library / Tracks */}
            {activeTab === 'library' && (
              <div className="space-y-1">
                {tracks.length === 0 ? (
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
                ) : (
                  tracks.map((track) => {
                    const isSelected = currentTrack?.id === track.id;
                    return (
                      <div
                        key={track.id}
                        onClick={() => handlePlayTrack(track)}
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

                          {!track.coverBlob && (
                            <button
                              onClick={(e) => handleFindCover(track, e)}
                              className="p-1.5 text-neutral-400 hover:text-white transition"
                              title="Найти заставку в сети"
                            >
                              <Sparkles className="w-4 h-4 text-amber-400" />
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
                            <FolderPlus className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => handleToggleFavorite(track.id, e)}
                            className={`p-1.5 transition ${
                              track.isFavorite ? 'text-white' : 'text-neutral-500 hover:text-white'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-current' : ''}`} />
                          </button>

                          <button
                            onClick={(e) => handleDelete(track.id, e)}
                            className="p-1.5 text-neutral-500 hover:text-white transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Albums Tab (Full support for custom & tag albums) */}
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
                        onClick={() => handlePlayTrack(artistTracks[0])}
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

      {/* Floating Mini Player - Mathematical precision above Tab Bar */}
      {currentTrack && !isFullPlayerOpen && (
        <div className="fixed bottom-[calc(50px+env(safe-area-inset-bottom,0px)+8px)] left-3 right-3 z-30">
          <MiniPlayer
            track={currentTrack}
            isPlaying={isPlaying}
            onOpen={() => setIsFullPlayerOpen(true)}
            onNext={handleNextTrack}
          />
        </div>
      )}

      {/* Clean Solid iOS Tab Bar - No awkward raised gap */}
      <nav className="apple-tab-bar fixed bottom-0 left-0 right-0 z-20 px-3 pb-safe flex items-center justify-around h-[calc(50px+env(safe-area-inset-bottom,0px))]">
        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === 'library' ? 'text-white font-bold' : 'text-neutral-500'
          }`}
        >
          <Library className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Медиатека</span>
        </button>

        <button
          onClick={() => setActiveTab('albums')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === 'albums' ? 'text-white font-bold' : 'text-neutral-500'
          }`}
        >
          <Disc3 className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Альбомы</span>
        </button>

        <button
          onClick={() => setActiveTab('artists')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === 'artists' ? 'text-white font-bold' : 'text-neutral-500'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Артисты</span>
        </button>

        <button
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === 'search' ? 'text-white font-bold' : 'text-neutral-500'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">Поиск</span>
        </button>
      </nav>

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

      {/* Fullscreen Player Modal */}
      {currentTrack && isFullPlayerOpen && (
        <FullPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onClose={() => setIsFullPlayerOpen(false)}
          onNext={handleNextTrack}
          onPrev={handlePrevTrack}
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
