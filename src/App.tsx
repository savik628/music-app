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
} from 'lucide-react';
import type { Track } from './types';
import { getAllTracks, saveTrack, deleteTrack, toggleFavorite } from './db';
import { parseAudioFile } from './parser';
import { audioEngine } from './audio';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayer } from './components/FullPlayer';
import { CoverImage } from './components/CoverImage';
import { SearchTab } from './components/SearchTab';

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load tracks from IndexedDB
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

  // Handle local files import
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setImporting(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(file.name)) {
        try {
          const parsed = await parseAudioFile(file);
          await saveTrack(parsed);
        } catch (err) {
          console.error('Error importing file:', file.name, err);
        }
      }
    }
    await refreshLibrary();
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    }
  };

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleFavorite(id);
    refreshLibrary();
  };

  // Groupings
  const albumsMap = tracks.reduce((acc, track) => {
    const key = track.album || 'Неизвестный альбом';
    if (!acc[key]) acc[key] = [];
    acc[key].push(track);
    return acc;
  }, {} as Record<string, Track[]>);

  const artistsMap = tracks.reduce((acc, track) => {
    const key = track.artist || 'Неизвестный исполнитель';
    if (!acc[key]) acc[key] = [];
    acc[key].push(track);
    return acc;
  }, {} as Record<string, Track[]>);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-white overflow-hidden">
      {/* Top Header */}
      <header className="px-6 pt-12 pb-4 flex items-center justify-between border-b border-neutral-900">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {activeTab === 'library' && 'Медиатека'}
            {activeTab === 'albums' && 'Альбомы'}
            {activeTab === 'artists' && 'Артисты'}
            {activeTab === 'search' && 'Поиск'}
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">Офлайн веб-плеер</p>
        </div>

        {/* Add audio files button */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            multiple
            accept="audio/*"
            ref={fileInputRef}
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-full text-xs font-semibold shadow-lg shadow-rose-950/40 transition"
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Добавить музыку
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Library / All Tracks */}
            {activeTab === 'library' && (
              <div className="space-y-1 pb-24">
                {tracks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                    <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center text-rose-500 mb-4">
                      <Music className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-bold">Ваша музыка пуста</p>
                    <p className="text-xs text-neutral-400 max-w-xs mt-1 mb-6">
                      Нажмите «Добавить музыку», чтобы выбрать аудиофайлы с телефона/ПК, или найдите треки во вкладке «Поиск».
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-5 py-2.5 bg-rose-600 rounded-full text-sm font-semibold text-white shadow-lg shadow-rose-950/40 active:scale-95 transition"
                    >
                      Выбрать файлы
                    </button>
                  </div>
                ) : (
                  tracks.map((track) => (
                    <div
                      key={track.id}
                      onClick={() => handlePlayTrack(track)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition ${
                        currentTrack?.id === track.id
                          ? 'bg-neutral-800/80 text-rose-500'
                          : 'hover:bg-neutral-900/60 active:bg-neutral-900 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden mr-2">
                        <div className="w-12 h-12 flex-shrink-0">
                          <CoverImage
                            blob={track.coverBlob}
                            alt={track.title}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-semibold truncate leading-tight">
                            {track.title}
                          </p>
                          <p className="text-xs text-neutral-400 truncate mt-0.5">
                            {track.artist} {track.album ? `• ${track.album}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-neutral-500 font-mono">
                          {formatDuration(track.duration)}
                        </span>
                        <button
                          onClick={(e) => handleToggleFavorite(track.id, e)}
                          className={`p-1.5 transition ${
                            track.isFavorite ? 'text-rose-500' : 'text-neutral-500 hover:text-white'
                          }`}
                        >
                          <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(track.id, e)}
                          className="p-1.5 text-neutral-500 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Albums Tab */}
            {activeTab === 'albums' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-24">
                {Object.keys(albumsMap).map((albumName) => {
                  const albumTracks = albumsMap[albumName];
                  const firstWithCover = albumTracks.find((t) => t.coverBlob);

                  return (
                    <div
                      key={albumName}
                      onClick={() => handlePlayTrack(albumTracks[0])}
                      className="cursor-pointer group space-y-2"
                    >
                      <div className="aspect-square w-full rounded-2xl overflow-hidden shadow-lg group-hover:opacity-90 transition">
                        <CoverImage
                          blob={firstWithCover?.coverBlob}
                          alt={albumName}
                          className="w-full h-full object-cover rounded-2xl"
                        />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold truncate">{albumName}</h4>
                        <p className="text-xs text-neutral-400 truncate">
                          {albumTracks[0]?.artist} • {albumTracks.length} треков
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Artists Tab */}
            {activeTab === 'artists' && (
              <div className="space-y-2 pb-24">
                {Object.keys(artistsMap).map((artistName) => {
                  const artistTracks = artistsMap[artistName];
                  return (
                    <div
                      key={artistName}
                      onClick={() => handlePlayTrack(artistTracks[0])}
                      className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/40 hover:bg-neutral-900 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{artistName}</p>
                          <p className="text-xs text-neutral-400">{artistTracks.length} треков</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search Tab */}
            {activeTab === 'search' && (
              <SearchTab onTrackDownloaded={refreshLibrary} />
            )}
          </>
        )}
      </main>

      {/* Floating Mini Player */}
      {currentTrack && !isFullPlayerOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-30">
          <MiniPlayer
            track={currentTrack}
            isPlaying={isPlaying}
            onOpen={() => setIsFullPlayerOpen(true)}
            onNext={handleNextTrack}
          />
        </div>
      )}

      {/* Bottom Apple Style Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-neutral-950/80 backdrop-blur-2xl border-t border-neutral-900 flex items-center justify-around z-20 px-2 pb-safe">
        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === 'library' ? 'text-rose-500 font-medium' : 'text-neutral-400'
          }`}
        >
          <Library className="w-5 h-5" />
          <span className="text-[10px] mt-1">Медиатека</span>
        </button>

        <button
          onClick={() => setActiveTab('albums')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === 'albums' ? 'text-rose-500 font-medium' : 'text-neutral-400'
          }`}
        >
          <Disc3 className="w-5 h-5" />
          <span className="text-[10px] mt-1">Альбомы</span>
        </button>

        <button
          onClick={() => setActiveTab('artists')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === 'artists' ? 'text-rose-500 font-medium' : 'text-neutral-400'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] mt-1">Артисты</span>
        </button>

        <button
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            activeTab === 'search' ? 'text-rose-500 font-medium' : 'text-neutral-400'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] mt-1">Поиск</span>
        </button>
      </nav>

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
