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
} from 'lucide-react';
import { saveTrack } from '../db';
import type { Track } from '../types';
import { searchTracks, getPopularTracks, type SearchTrack } from '../searchService';
import { audioEngine } from '../audio';

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
      alert('Не удалось скачать файл напрямую. Откройте Sefon по ссылке внизу списка для прямого MP3.');
    } finally {
      setDownloadingId(null);
    }
  };

  const displayList = isSearched ? searchResults : popularTracks;

  return (
    <div className="space-y-4 pb-48">
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
          placeholder="Поиск артистов или треков..."
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

      {/* Empty Search Result with Direct Sefon Link */}
      {isSearched && !loading && searchResults.length === 0 && (
        <div className="text-center py-12 px-4 bg-neutral-900/40 rounded-2xl border border-neutral-800/80 space-y-3">
          <p className="text-sm font-semibold text-white">В открытом каталоге трек не найден</p>
          <p className="text-xs text-neutral-400 max-w-xs mx-auto leading-relaxed">
            Вы можете в один клик найти и скачать этот трек в MP3 на Sefon, а затем нажать «+ Добавить музыку» вверху.
          </p>
          <a
            href={`https://sefon.pro/search/?q=${encodeURIComponent(query.trim())}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-black rounded-xl text-xs font-bold active:scale-95 transition shadow-lg"
          >
            Найти «{query}» на Sefon.pro <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Songs List (Popular or Search Results) */}
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
                    <p className="text-sm font-semibold text-white truncate leading-tight">
                      {res.title}
                    </p>
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

      {/* Sefon Quick Direct Link */}
      <div className="pt-2">
        <a
          href={
            query.trim()
              ? `https://sefon.pro/search/?q=${encodeURIComponent(query.trim())}`
              : 'https://sefon.pro/mp3/'
          }
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-800/80 rounded-2xl active:scale-[0.99] transition text-xs font-semibold text-neutral-400 hover:text-white"
        >
          <span>{query.trim() ? `Искать «${query.trim()}» на Sefon.pro` : 'Открыть каталог Sefon.pro'}</span>
          <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
        </a>
      </div>
    </div>
  );
};
