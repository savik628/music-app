import React, { useState, useRef, useEffect } from 'react';
import {
  Search as SearchIcon,
  Download,
  Loader2,
  Play,
  Pause,
  Check,
  Flame,
  X,
  Disc3,
  Music2,
  ChevronLeft,
  Calendar,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { saveTrack } from '../db';
import type { Track } from '../types';
import {
  searchTracks,
  getPopularTracks,
  pickArchiveMp3,
  searchAlbums,
  getAlbumTracks,
  type SearchTrack,
  type SearchAlbum,
  type AlbumTrackItem,
} from '../searchService';
import { audioEngine } from '../audio';
import { searchCoverOnline } from '../coverService';

interface SearchTabProps {
  onTrackDownloaded: () => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({ onTrackDownloaded }) => {
  const [searchMode, setSearchMode] = useState<'tracks' | 'albums'>('tracks');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [popularLoading, setPopularLoading] = useState(true);
  const [popularTracks, setPopularTracks] = useState<SearchTrack[]>([]);
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [albumResults, setAlbumResults] = useState<SearchAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<SearchAlbum | null>(null);
  const [albumTracks, setAlbumTracks] = useState<AlbumTrackItem[]>([]);
  const [albumLoading, setAlbumLoading] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [isSearched, setIsSearched] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, string>>({});

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load popular hits on mount and sync stop signals
  useEffect(() => {
    getPopularTracks()
      .then((data) => setPopularTracks(data))
      .catch((err) => console.warn('Popular tracks error:', err))
      .finally(() => setPopularLoading(false));

    const unsub = audioEngine.onStopPreview(() => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewTrackId(null);
    });

    return () => {
      unsub();
      audioEngine.stopPreview();
    };
  }, []);

  const togglePreview = async (item: SearchTrack | AlbumTrackItem) => {
    if (previewTrackId === item.id) {
      audioEngine.stopPreview();
      setPreviewTrackId(null);
      return;
    }

    let url = item.audioUrl;
    if (!url) return;

    if (item.id.startsWith('arch-')) {
      try {
        const archId = item.id.replace('arch-', '');
        const metaRes = await fetch(`https://archive.org/metadata/${archId}`, {
          signal: AbortSignal.timeout(10000),
        });
        const meta = await metaRes.json();
        const picked = pickArchiveMp3(meta, archId);
        if (picked?.url) {
          url = picked.url;
        }
      } catch {}
    }

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.addEventListener('ended', () => {
        setPreviewTrackId(null);
      });
    }

    previewAudioRef.current.src = url;
    audioEngine.playPreview(previewAudioRef.current);
    previewAudioRef.current.play().catch(() => {});
    setPreviewTrackId(item.id);
  };

  const handleSearch = async (e?: React.FormEvent, customQ?: string) => {
    if (e) e.preventDefault();
    const targetQ = (customQ !== undefined ? customQ : query).trim();

    if (!targetQ) {
      setIsSearched(false);
      setSearchResults([]);
      setAlbumResults([]);
      return;
    }

    audioEngine.stopPreview();
    setPreviewTrackId(null);
    setSelectedAlbum(null);

    setLoading(true);
    setIsSearched(true);

    try {
      if (searchMode === 'tracks') {
        const items = await searchTracks(targetQ);
        setSearchResults(items);
      } else {
        const albums = await searchAlbums(targetQ);
        setAlbumResults(albums);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setIsSearched(false);
    setSearchResults([]);
    setAlbumResults([]);
    setSelectedAlbum(null);
    audioEngine.stopPreview();
    setPreviewTrackId(null);
  };

  // Open Album Detail
  const handleOpenAlbum = async (album: SearchAlbum) => {
    setSelectedAlbum(album);
    setAlbumLoading(true);
    setAlbumTracks([]);

    try {
      const data = await getAlbumTracks(album.collectionId);
      setAlbumTracks(data.tracks || []);
    } catch (err) {
      console.error('Failed to load album tracks:', err);
    } finally {
      setAlbumLoading(false);
    }
  };

  // Download a single track
  const handleDownload = async (item: SearchTrack) => {
    if (item.isFullVersion !== true) {
      alert('Это 30-секундное превью iTunes — в медиатеку сохраняются только полные треки.');
      return;
    }

    setDownloadingId(item.id);
    setDownloadProgress((prev) => ({ ...prev, [item.id]: 'Соединение...' }));

    try {
      let downloadUrl = item.audioUrl;
      let duration = item.duration;

      if (item.id.startsWith('arch-')) {
        const archId = item.id.replace('arch-', '');
        const metaRes = await fetch(`https://archive.org/metadata/${archId}`, {
          signal: AbortSignal.timeout(10000),
        });
        const meta = await metaRes.json();
        const picked = pickArchiveMp3(meta, archId);
        if (!picked?.url) throw new Error('MP3 не найден');
        downloadUrl = picked.url;
        if (picked.durationSec) {
          duration = picked.durationSec;
        }
      }

      if (!downloadUrl) throw new Error('Нет ссылки для скачивания');

      setDownloadProgress((prev) => ({ ...prev, [item.id]: 'Скачивание...' }));
      const res = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const reader = res.body?.getReader();
      let audioBlob: Blob;

      if (reader) {
        const contentLength = +(res.headers.get('Content-Length') || 0);
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          receivedLength += value.length;

          const mb = (receivedLength / (1024 * 1024)).toFixed(1);
          if (contentLength > 0) {
            const totalMb = (contentLength / (1024 * 1024)).toFixed(1);
            setDownloadProgress((prev) => ({ ...prev, [item.id]: `${mb}/${totalMb} МБ` }));
          } else {
            setDownloadProgress((prev) => ({ ...prev, [item.id]: `${mb} МБ` }));
          }
        }

        audioBlob = new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") || "audio/mpeg" });
      } else {
        audioBlob = await res.blob();
      }

      setDownloadProgress((prev) => ({ ...prev, [item.id]: 'Обложка...' }));

      let coverBlob: Blob | undefined;
      if (item.coverUrl) {
        try {
          const cRes = await fetch(item.coverUrl, {
            signal: AbortSignal.timeout(10000),
          });
          if (cRes.ok) coverBlob = await cRes.blob();
        } catch {}
      }

      // If no cover or failed to fetch, automatically search cover online
      if (!coverBlob) {
        try {
          const found = await searchCoverOnline(item.artist, item.title);
          if (found) coverBlob = found;
        } catch {}
      }

      const newTrack: Track = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration,
        audioBlob,
        coverBlob,
        addedAt: Date.now(),
        isFavorite: false,
      };

      await saveTrack(newTrack);
      setDownloadedIds((prev) => new Set(prev).add(item.id));
      onTrackDownloaded();
    } catch {
      alert('Не удалось скачать файл.');
    } finally {
      setDownloadingId(null);
    }
  };

  const displayList = isSearched ? searchResults : popularTracks;

  return (
    <div className="space-y-3 pb-8">
      {/* Segmented Mode Switcher: Tracks vs Albums */}
      <div className="flex bg-neutral-900/90 p-1 rounded-2xl border border-neutral-800">
        <button
          onClick={() => {
            setSearchMode('tracks');
            setSelectedAlbum(null);
            if (query.trim()) handleSearch(undefined, query);
          }}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            searchMode === 'tracks'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Music2 className="w-3.5 h-3.5" />
          <span>Треки</span>
        </button>

        <button
          onClick={() => {
            setSearchMode('albums');
            setSelectedAlbum(null);
            if (query.trim()) handleSearch(undefined, query);
          }}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            searchMode === 'albums'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Disc3 className="w-3.5 h-3.5" />
          <span>Альбомы</span>
        </button>
      </div>

      {/* Search Input Form */}
      <form onSubmit={handleSearch} className="relative">
        <SearchIcon className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            searchMode === 'tracks'
              ? 'Найти трек (например: Олина попа, Баста)...'
              : 'Найти альбом (например: N1NT3NDO, Баста 5)...'
          }
          className="w-full pl-9 pr-20 py-2.5 bg-neutral-900 border border-neutral-800 rounded-2xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition"
        />

        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-14 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-white transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1.5 px-3 py-1 bg-white text-black text-xs font-bold rounded-xl disabled:opacity-40 active:scale-95 transition"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Найти'}
        </button>
      </form>

      {/* Quick Search Shortcuts */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {['Олина попа', 'N1NT3NDO', 'Баста', 'Скриптонит', 'Miyagi'].map((item) => (
          <button
            key={item}
            onClick={() => {
              setQuery(item);
              handleSearch(undefined, item);
            }}
            className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full text-xs font-medium text-neutral-300 whitespace-nowrap active:scale-95 transition"
          >
            {item}
          </button>
        ))}
      </div>

      {/* 1. ALBUM DETAIL VIEW (When an album is opened) */}
      {selectedAlbum ? (
        <div className="space-y-3 animate-in fade-in duration-200">
          <button
            onClick={() => setSelectedAlbum(null)}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Назад к альбомам</span>
          </button>

          {/* Album Hero Card */}
          <div className="p-4 rounded-3xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-neutral-800 flex-shrink-0 shadow-lg">
              {selectedAlbum.coverUrl ? (
                <img
                  src={selectedAlbum.coverUrl}
                  alt={selectedAlbum.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600">
                  <Disc3 className="w-8 h-8" />
                </div>
              )}
            </div>

            <div className="overflow-hidden flex-1">
              <h2 className="text-base font-bold text-white truncate leading-tight">
                {selectedAlbum.title}
              </h2>
              <p className="text-xs text-neutral-400 truncate mt-0.5 font-medium">
                {selectedAlbum.artist}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-neutral-500 mt-2">
                {selectedAlbum.releaseDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {selectedAlbum.releaseDate}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {selectedAlbum.trackCount} треков
                </span>
              </div>
            </div>
          </div>

          {/* Album Tracks List */}
          {albumLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-500 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span className="text-xs">Загрузка трек-листа альбома...</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {albumTracks.map((t, idx) => {
                const isPreviewing = previewTrackId === t.id;
                const min = Math.floor(t.duration / 60);
                const sec = Math.floor(t.duration % 60).toString().padStart(2, '0');

                return (
                  <div
                    key={t.id}
                    className={`p-2.5 rounded-2xl border transition flex items-center justify-between ${
                      isPreviewing
                        ? 'bg-neutral-800/90 border-neutral-600 shadow-md'
                        : 'bg-neutral-900/60 border-neutral-800/60 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden mr-2">
                      <span className="w-5 text-center text-xs font-mono text-neutral-500 flex-shrink-0">
                        {t.trackNumber || idx + 1}
                      </span>
                      <div className="overflow-hidden">
                        <p className="text-sm font-semibold text-white truncate leading-tight">
                          {t.title}
                        </p>
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                          {t.artist} • {min}:{sec}
                        </p>
                      </div>
                    </div>

                    {t.audioUrl && (
                      <button
                        onClick={() => togglePreview(t)}
                        className={`p-2 rounded-xl flex-shrink-0 active:scale-95 transition ${
                          isPreviewing
                            ? 'bg-white text-black'
                            : 'bg-neutral-800 text-neutral-300 hover:text-white'
                        }`}
                        title="Слушать превью"
                      >
                        {isPreviewing ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current translate-x-0.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : searchMode === 'albums' ? (
        /* 2. ALBUMS SEARCH RESULTS VIEW */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 pt-1">
            <h2 className="text-sm font-bold text-white tracking-tight">
              {isSearched ? `Найдено альбомов (${albumResults.length})` : 'Дискография и альбомы'}
            </h2>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-500 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span className="text-xs">Поиск официальных альбомов...</span>
            </div>
          )}

          {!loading && isSearched && albumResults.length === 0 && (
            <div className="text-center py-8 px-4 bg-neutral-900/40 rounded-3xl border border-neutral-800 space-y-2">
              <p className="text-sm font-bold text-white">Альбомы не найдены</p>
              <p className="text-xs text-neutral-400">Попробуйте ввести имя артиста, например «N1NT3NDO» или «Баста».</p>
            </div>
          )}

          {!loading && albumResults.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {albumResults.map((alb) => (
                <div
                  key={alb.id}
                  onClick={() => handleOpenAlbum(alb)}
                  className="p-2.5 rounded-2xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-850 transition cursor-pointer active:scale-[0.98] flex flex-col"
                >
                  <div className="aspect-square w-full rounded-xl overflow-hidden bg-neutral-800 mb-2 shadow-md">
                    {alb.coverUrl ? (
                      <img
                        src={alb.coverUrl}
                        alt={alb.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600">
                        <Disc3 className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-bold text-white truncate leading-tight">
                    {alb.title}
                  </p>
                  <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                    {alb.artist}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-1 font-mono">
                    {alb.releaseDate ? `${alb.releaseDate} • ` : ''}{alb.trackCount} треков
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* 3. TRACKS SEARCH RESULTS / POPULAR VIEW */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-1.5">
              {!isSearched && <Flame className="w-4 h-4 text-white" />}
              <h2 className="text-sm font-bold text-white tracking-tight">
                {isSearched ? `Результаты поиска (${searchResults.length})` : 'Хиты недели — Apple Music Россия'}
              </h2>
            </div>
            <span className="text-[11px] text-neutral-400 font-medium">
              ▶ Превью • ⬇ В память
            </span>
          </div>

          {/* Loading Spinner */}
          {(loading || (popularLoading && !isSearched)) && (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-500 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span className="text-xs">Загрузка каталога треков...</span>
            </div>
          )}

          {/* Empty Search Result */}
          {isSearched && !loading && searchResults.length === 0 && (
            <div className="text-center py-8 px-4 bg-neutral-900/40 rounded-3xl border border-neutral-800/80 space-y-2">
              <p className="text-sm font-bold text-white">Ничего не нашлось. Добавьте свои файлы кнопкой «+ Добавить музыку».</p>
            </div>
          )}

          {/* Songs List */}
          {!loading && displayList.length > 0 && (
            <div className="space-y-2">
              {displayList.map((res) => {
                const isDownloaded = downloadedIds.has(res.id);
                const isDownloading = downloadingId === res.id;
                const isPreviewing = previewTrackId === res.id;

                return (
                  <div
                    key={res.id}
                    className={`p-2.5 rounded-2xl border transition ${
                      isPreviewing
                        ? 'bg-neutral-800/90 border-neutral-600 shadow-md'
                        : 'bg-neutral-900/60 border-neutral-800/70 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 overflow-hidden mr-2">
                        {/* Play preview button with cover thumbnail */}
                        <button
                          onClick={() => togglePreview(res)}
                          className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 group active:scale-95 transition"
                        >
                          {res.coverUrl ? (
                            <img
                              src={res.coverUrl}
                              alt={res.title}
                              className="w-full h-full object-cover rounded-xl"
                            />
                          ) : (
                            <div className="w-full h-full bg-neutral-800 rounded-xl flex items-center justify-center text-neutral-400">
                              <Play className="w-4 h-4 fill-current" />
                            </div>
                          )}
                          <div
                            className={`absolute inset-0 flex items-center justify-center bg-black/40 transition ${
                              isPreviewing ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
                            }`}
                          >
                            {isPreviewing ? (
                              <Pause className="w-5 h-5 text-white fill-current" />
                            ) : (
                              <Play className="w-5 h-5 text-white fill-current translate-x-0.5" />
                            )}
                          </div>
                        </button>

                        {/* Title, artist & badges */}
                        <div className="overflow-hidden">
                          <p className="text-sm font-semibold text-white truncate leading-tight">
                            {res.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-neutral-400 truncate">
                              {res.artist}
                            </p>
                            {res.isFullVersion ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0">
                                Полный MP3
                              </span>
                            ) : (
                              <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 flex-shrink-0">
                                30с демо
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions: Download button (only for full tracks) */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {res.isFullVersion && (
                          <button
                            onClick={() => handleDownload(res)}
                            disabled={isDownloading || isDownloaded}
                            className={`px-2.5 py-2 rounded-xl flex-shrink-0 active:scale-95 transition flex items-center gap-1.5 ${
                              isDownloaded
                                ? 'bg-neutral-800 text-white cursor-default'
                                : 'bg-white text-black hover:bg-neutral-200 shadow-sm'
                            }`}
                            title="Скачать полный трек в офлайн"
                          >
                            {isDownloading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                                <span className="text-[10px] font-mono font-bold text-black">
                                  {downloadProgress[res.id] || '...'}
                                </span>
                              </>
                            ) : isDownloaded ? (
                              <Check className="w-4 h-4 text-white" />
                            ) : (
                              <Download className="w-4 h-4 text-black" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* External Services Links */}
          {isSearched && !loading && query.trim() && (
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2 text-center">
              <span className="text-xs text-neutral-400">Нет нужного трека? Слушать в:</span>
              <div className="flex items-center gap-2">
                <a
                  href={`https://music.yandex.ru/search?text=${encodeURIComponent(query.trim())}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition active:scale-95"
                >
                  <span>Яндекс Музыка</span>
                  <ExternalLink className="w-3 h-3 text-neutral-400" />
                </a>
                <a
                  href={`https://vk.com/audio?q=${encodeURIComponent(query.trim())}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition active:scale-95"
                >
                  <span>VK Музыка</span>
                  <ExternalLink className="w-3 h-3 text-neutral-400" />
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
