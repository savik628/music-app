import React, { useState, useRef, useEffect } from 'react';
import {
  Search as SearchIcon,
  Download,
  Loader2,
  Play,
  Pause,
  ExternalLink,
  Check,
} from 'lucide-react';
import { saveTrack } from '../db';
import type { Track } from '../types';
import { searchTracks, type SearchTrack } from '../searchService';

interface SearchTabProps {
  onTrackDownloaded: () => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({ onTrackDownloaded }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const togglePreview = async (item: SearchTrack) => {
    if (previewTrackId === item.id) {
      previewAudioRef.current?.pause();
      setPreviewTrackId(null);
      return;
    }

    let url = item.audioUrl;
    if (!url) return;

    if (item.source === 'russian-archive') {
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
      previewAudioRef.current.addEventListener('ended', () => setPreviewTrackId(null));
    }

    previewAudioRef.current.src = url;
    previewAudioRef.current.play().catch(() => {});
    setPreviewTrackId(item.id);
  };

  const handleSearch = async (e?: React.FormEvent, customQ?: string) => {
    if (e) e.preventDefault();
    const targetQ = customQ || query;
    if (!targetQ.trim()) return;

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewTrackId(null);
    }

    setLoading(true);
    setSearched(true);
    setResults([]);

    try {
      const items = await searchTracks(targetQ);
      setResults(items);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (item: SearchTrack) => {
    setDownloadingId(item.id);
    try {
      let downloadUrl = item.audioUrl;

      if (item.source === 'russian-archive') {
        const archId = item.id.replace('arch-', '');
        const metaRes = await fetch(`https://archive.org/metadata/${archId}`);
        const meta = await metaRes.json();
        const mp3 = (meta.files || []).find((f: any) => f.name?.toLowerCase().endsWith('.mp3'));
        if (!mp3) throw new Error('MP3 не найден');
        downloadUrl = `https://archive.org/download/${archId}/${encodeURIComponent(mp3.name)}`;
      }

      if (!downloadUrl) throw new Error('Нет ссылки');

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
      alert('Не удалось скачать этот трек напрямую. Скачайте на Sefon по кнопке ниже.');
    } finally {
      setDownloadingId(null);
    }
  };

  const sefonUrl = query.trim()
    ? `https://sefon.pro/search/?q=${encodeURIComponent(query.trim())}`
    : 'https://sefon.pro/mp3/';

  return (
    <div className="space-y-4 pb-44">
      {/* Clean Apple Search Bar */}
      <form onSubmit={(e) => handleSearch(e)} className="relative">
        <SearchIcon className="absolute left-3.5 top-3.5 w-5 h-5 text-neutral-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по артистам и песням..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl pl-11 pr-24 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 transition"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-2 px-4 py-1.5 bg-white text-black text-xs font-bold rounded-xl disabled:opacity-40 active:scale-95 transition"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Искать'}
        </button>
      </form>

      {/* Sefon Quick Access Pill */}
      <a
        href={sefonUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between p-3.5 bg-neutral-900 border border-neutral-800 rounded-2xl active:scale-[0.99] transition"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-xs font-bold text-white">
            {query.trim() ? `Каталог Sefon: «${query.trim()}»` : 'Открыть базу Sefon.pro'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400">
          <span>Скачать MP3</span>
          <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
        </div>
      </a>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-500 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
          <span className="text-xs">Поиск треков...</span>
        </div>
      )}

      {/* Empty State */}
      {searched && !loading && results.length === 0 && (
        <div className="text-center py-12 px-4 space-y-2">
          <p className="text-sm font-semibold text-white">Ничего не найдено</p>
          <p className="text-xs text-neutral-500">
            Этот трек можно в 1 клик скачать на Sefon.pro по ссылке выше и загрузить через «+ Добавить музыку».
          </p>
        </div>
      )}

      {/* Results List */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((res) => {
            const isDownloaded = downloadedIds.has(res.id);
            const isDownloading = downloadingId === res.id;
            const isPreviewing = previewTrackId === res.id;

            return (
              <div
                key={res.id}
                className={`flex items-center justify-between p-2.5 rounded-2xl border transition ${
                  isPreviewing
                    ? 'bg-neutral-800/90 border-neutral-600'
                    : 'bg-neutral-900/60 border-neutral-800/60'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden mr-2">
                  <button
                    onClick={() => togglePreview(res)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 active:scale-95 transition ${
                      isPreviewing ? 'bg-white text-black' : 'bg-neutral-800 text-white'
                    }`}
                  >
                    {isPreviewing ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current translate-x-0.5" />
                    )}
                  </button>

                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold text-white truncate leading-tight">
                      {res.title}
                    </p>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {res.artist}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDownload(res)}
                  disabled={isDownloading || isDownloaded}
                  className={`p-2.5 rounded-xl flex-shrink-0 active:scale-95 transition ${
                    isDownloaded
                      ? 'bg-neutral-800 text-white cursor-default'
                      : 'bg-white text-black hover:bg-neutral-200'
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
    </div>
  );
};
