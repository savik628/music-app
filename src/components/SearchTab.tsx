import React, { useState, useRef, useEffect } from 'react';
import {
  Search as SearchIcon,
  Download,
  Loader2,
  Play,
  Pause,
  ExternalLink,
  Check,
  Flame,
  X,
  Globe,
  Radio,
} from 'lucide-react';
import { saveTrack } from '../db';
import type { Track } from '../types';
import { searchTracks, getPopularTracks, type SearchTrack } from '../searchService';
import { audioEngine } from '../audio';
import { searchCoverOnline } from '../coverService';

interface SearchTabProps {
  onTrackDownloaded: () => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({ onTrackDownloaded }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [popularLoading, setPopularLoading] = useState(true);
  const [popularTracks, setPopularTracks] = useState<SearchTrack[]>([]);
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [isSearched, setIsSearched] = useState(false);

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

  const togglePreview = async (item: SearchTrack) => {
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
        const metaRes = await fetch(`https://archive.org/metadata/${archId}`);
        const meta = await metaRes.json();
        const mp3 = (meta.files || []).find((f: any) => f.name?.toLowerCase().endsWith('.mp3'));
        if (mp3) {
          url = `https://archive.org/download/${archId}/${encodeURIComponent(mp3.name)}`;
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
      return;
    }

    audioEngine.stopPreview();
    setPreviewTrackId(null);

    setLoading(true);
    setIsSearched(true);
    setSearchResults([]);

    try {
      const items = await searchTracks(targetQ);
      setSearchResults(items);
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
    audioEngine.stopPreview();
    setPreviewTrackId(null);
  };

  const handleDownload = async (item: SearchTrack) => {
    setDownloadingId(item.id);
    try {
      let downloadUrl = item.audioUrl;

      if (item.id.startsWith('arch-')) {
        const archId = item.id.replace('arch-', '');
        const metaRes = await fetch(`https://archive.org/metadata/${archId}`);
        const meta = await metaRes.json();
        const mp3 = (meta.files || []).find((f: any) => f.name?.toLowerCase().endsWith('.mp3'));
        if (!mp3) throw new Error('MP3 не найден');
        downloadUrl = `https://archive.org/download/${archId}/${encodeURIComponent(mp3.name)}`;
      }

      if (!downloadUrl) throw new Error('Нет ссылки для скачивания');

      const res = await fetch(downloadUrl);
      const audioBlob = await res.blob();

      let coverBlob: Blob | undefined;
      if (item.coverUrl) {
        try {
          const cRes = await fetch(item.coverUrl);
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
        duration: item.duration,
        audioBlob,
        coverBlob,
        addedAt: Date.now(),
        isFavorite: false,
      };

      await saveTrack(newTrack);
      setDownloadedIds((prev) => new Set(prev).add(item.id));
      onTrackDownloaded();
    } catch {
      alert('Не удалось скачать файл напрямую. Воспользуйтесь одним из сайтов ниже для прямого MP3 файла.');
    } finally {
      setDownloadingId(null);
    }
  };

  const displayList = isSearched ? searchResults : popularTracks;
  const currentQueryTerm = query.trim();

  // Download Portals Links (SoundCloud, Sefon, Hitmo, Zaycev)
  const downloadSites = [
    {
      name: 'SoundCloud',
      badge: 'Треки и ремиксы',
      color: 'from-[#ff5500]/20 to-[#ff3300]/10 border-[#ff5500]/30 hover:border-[#ff5500]',
      url: currentQueryTerm
        ? `https://soundcloud.com/search?q=${encodeURIComponent(currentQueryTerm)}`
        : 'https://soundcloud.com/discover',
    },
    {
      name: 'Sefon.pro',
      badge: 'Прямой MP3',
      color: 'from-purple-900/20 to-purple-800/10 border-purple-800/30 hover:border-purple-600',
      url: currentQueryTerm
        ? `https://sefon.pro/search/?q=${encodeURIComponent(currentQueryTerm)}`
        : 'https://sefon.pro/mp3/',
    },
    {
      name: 'Hitmo Top',
      badge: 'Быстрая загрузка',
      color: 'from-blue-900/20 to-blue-800/10 border-blue-800/30 hover:border-blue-600',
      url: currentQueryTerm
        ? `https://rus.hitmotop.com/search?q=${encodeURIComponent(currentQueryTerm)}`
        : 'https://rus.hitmotop.com/',
    },
    {
      name: 'Zaycev.net',
      badge: 'Миллионы песен',
      color: 'from-emerald-900/20 to-emerald-800/10 border-emerald-800/30 hover:border-emerald-600',
      url: currentQueryTerm
        ? `https://zaycev.net/search.html?query_search=${encodeURIComponent(currentQueryTerm)}`
        : 'https://zaycev.net/',
    },
  ];

  return (
    <div className="space-y-4 pb-6">
      {/* Clean Apple Minimalist Search Bar */}
      <form onSubmit={(e) => handleSearch(e)} className="relative">
        <SearchIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) {
              setIsSearched(false);
            }
          }}
          placeholder="Поиск треков, артистов или ссылка SoundCloud..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl pl-10 pr-20 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 transition"
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-14 top-3 text-neutral-500 hover:text-white p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1.5 px-3.5 py-1 bg-white text-black text-xs font-bold rounded-xl disabled:opacity-40 active:scale-95 transition"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Найти'}
        </button>
      </form>

      {/* Quick Search Shortcuts */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => {
            setQuery('N1NT3NDO');
            handleSearch(undefined, 'N1NT3NDO');
          }}
          className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full text-xs font-medium text-neutral-300 whitespace-nowrap active:scale-95 transition"
        >
          N1NT3NDO
        </button>
        <button
          onClick={() => {
            setQuery('Miyagi');
            handleSearch(undefined, 'Miyagi');
          }}
          className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full text-xs font-medium text-neutral-300 whitespace-nowrap active:scale-95 transition"
        >
          Miyagi
        </button>
        <button
          onClick={() => {
            setQuery('Скриптонит');
            handleSearch(undefined, 'Скриптонит');
          }}
          className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full text-xs font-medium text-neutral-300 whitespace-nowrap active:scale-95 transition"
        >
          Скриптонит
        </button>
        <button
          onClick={() => {
            setQuery('Баста');
            handleSearch(undefined, 'Баста');
          }}
          className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-full text-xs font-medium text-neutral-300 whitespace-nowrap active:scale-95 transition"
        >
          Баста
        </button>
      </div>

      {/* Section Title */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-1.5">
          {!isSearched && <Flame className="w-4 h-4 text-white" />}
          <h2 className="text-sm font-bold text-white tracking-tight">
            {isSearched ? `Результаты (${searchResults.length})` : 'Популярные песни'}
          </h2>
        </div>
        <span className="text-[11px] text-neutral-400 font-medium">
          ▶ Слушать • ⬇ В офлайн
        </span>
      </div>

      {/* Loading Spinner */}
      {(loading || (popularLoading && !isSearched)) && (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-500 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
          <span className="text-xs">Загрузка музыки...</span>
        </div>
      )}

      {/* Empty Search Result */}
      {isSearched && !loading && searchResults.length === 0 && (
        <div className="text-center py-8 px-4 bg-neutral-900/40 rounded-3xl border border-neutral-800/80 space-y-2">
          <p className="text-sm font-bold text-white">В каталоге трек не найден</p>
          <p className="text-xs text-neutral-400 max-w-xs mx-auto leading-relaxed">
            Скачайте песню в один клик на любом сайте ниже и нажмите «+ Добавить музыку» вверху — трек сразу сохранится в плеер, а обложка загрузится автоматически!
          </p>
        </div>
      )}

      {/* Songs List */}
      {!loading && displayList.length > 0 && (
        <div className="space-y-1.5">
          {displayList.map((res) => {
            const isDownloaded = downloadedIds.has(res.id);
            const isDownloading = downloadingId === res.id;
            const isPreviewing = previewTrackId === res.id;

            return (
              <div
                key={res.id}
                className={`flex items-center justify-between p-2.5 rounded-2xl border transition ${
                  isPreviewing
                    ? 'bg-neutral-800/90 border-neutral-600 shadow-md'
                    : 'bg-neutral-900/60 border-neutral-800/70 hover:bg-neutral-900'
                }`}
              >
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
                    {/* Play/Pause Overlay */}
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

                  {/* Title and artist */}
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <p className="text-sm font-semibold text-white truncate leading-tight">
                        {res.title}
                      </p>
                      {res.source === 'soundcloud' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#ff5500]/20 text-[#ff7700] border border-[#ff5500]/40 flex-shrink-0">
                          SoundCloud
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {res.artist}
                    </p>
                  </div>
                </div>

                {/* Download button */}
                <button
                  onClick={() => handleDownload(res)}
                  disabled={isDownloading || isDownloaded}
                  className={`p-2.5 rounded-xl flex-shrink-0 active:scale-95 transition ${
                    isDownloaded
                      ? 'bg-neutral-800 text-white cursor-default'
                      : 'bg-white text-black hover:bg-neutral-200 shadow-sm'
                  }`}
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                  ) : isDownloaded ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : (
                    <Download className="w-4 h-4 text-black" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Download Portals: Where to download songs directly */}
      <div className="pt-2 space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-neutral-400" />
            Где скачать в MP3:
          </span>
          <span className="text-[10px] text-neutral-500 font-medium">
            открывается в браузере
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {downloadSites.map((site) => (
            <a
              key={site.name}
              href={site.url}
              target="_blank"
              rel="noreferrer"
              className={`p-3 rounded-2xl bg-gradient-to-b ${site.color} border transition active:scale-[0.98] flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">{site.name}</span>
                <ExternalLink className="w-3 h-3 text-neutral-400" />
              </div>
              <span className="text-[10px] text-neutral-400 truncate font-medium">
                {currentQueryTerm ? `«${currentQueryTerm}»` : site.badge}
              </span>
            </a>
          ))}
        </div>

        <p className="text-[11px] text-neutral-500 px-1 leading-relaxed">
          💡 Скачайте песню с любого из этих сайтов, затем нажмите «+ Добавить музыку» вверху — трек сохранится в плеер навсегда, а заставка подберется сама.
        </p>
      </div>
    </div>
  );
};
