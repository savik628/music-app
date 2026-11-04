import React, { useState, useRef, useEffect } from 'react';
import {
  Search as SearchIcon,
  Download,
  Loader2,
  Play,
  Pause,
  ExternalLink,
  Globe,
  Check,
  Flame,
  Radio,
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
  const [customUrl, setCustomUrl] = useState('');
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

  const togglePreview = (item: SearchTrack) => {
    if (!item.audioUrl) return;

    if (previewTrackId === item.id) {
      previewAudioRef.current?.pause();
      setPreviewTrackId(null);
      return;
    }

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.addEventListener('ended', () => setPreviewTrackId(null));
    }

    previewAudioRef.current.src = item.audioUrl;
    previewAudioRef.current.play().catch((e) => console.warn('Preview play error:', e));
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

  // Download track directly into offline IndexedDB
  const handleDownload = async (item: SearchTrack) => {
    setDownloadingId(item.id);
    try {
      let downloadUrl = item.audioUrl;

      if (item.source === 'archive') {
        const archId = item.id.replace('archive-', '');
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
    } catch (err) {
      console.error('Download error:', err);
      alert('Не удалось скачать этот трек напрямую. Используйте быстрый поиск Sefon ниже для скачивания MP3.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Direct download from URL
  const handleDownloadUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(customUrl);
      if (!res.ok) throw new Error();
      const blob = await res.blob();

      const filename = customUrl.split('/').pop()?.split('?')[0] || 'Скачанный трек';
      const cleanTitle = decodeURIComponent(filename.replace(/\.[^/.]+$/, ''));

      const newTrack: Track = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        title: cleanTitle,
        artist: 'Загрузка по ссылке',
        album: 'Загрузки',
        duration: 0,
        audioBlob: blob,
        addedAt: Date.now(),
        isFavorite: false,
      };

      await saveTrack(newTrack);
      setCustomUrl('');
      onTrackDownloaded();
      alert('Трек сохранен в медиатеку!');
    } catch {
      alert('Браузер не смог напрямую скачать этот URL из-за политики безопасности сайта (CORS). Скачайте MP3 файл в память телефона и нажмите «+ Добавить музыку» вверху.');
    } finally {
      setLoading(false);
    }
  };

  const quickSearch = (artistName: string) => {
    setQuery(artistName);
    handleSearch(undefined, artistName);
  };

  return (
    <div className="space-y-4 pb-36">
      {/* Search Input Bar */}
      <form onSubmit={(e) => handleSearch(e)} className="relative">
        <SearchIcon className="absolute left-3.5 top-3.5 w-5 h-5 text-neutral-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Артист или название песни..."
          className="w-full bg-neutral-900/90 border border-neutral-800 rounded-2xl pl-11 pr-24 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 transition shadow-inner"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-2 px-4 py-1.5 bg-white text-black text-xs font-bold rounded-xl disabled:opacity-40 active:scale-95 transition"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Искать'}
        </button>
      </form>

      {/* Popular Russian Artists Fast Tags */}
      {!searched && results.length === 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1 text-neutral-400">
            <Flame className="w-4 h-4 text-white" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Популярные запросы</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['N1NT3ND0', 'Баста', 'Noggano', 'Скриптонит', 'Miyagi', 'ATL', 'Eminem', 'Queen'].map((tag) => (
              <button
                key={tag}
                onClick={() => quickSearch(tag)}
                className="px-3.5 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 rounded-full text-xs font-medium text-neutral-300 active:scale-95 transition"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sefon.pro Direct Search & Download Hub */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-white" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Каталог Sefon.pro (все редкие треки)
            </span>
          </div>
          <a
            href={
              query.trim()
                ? `https://sefon.pro/search/?q=${encodeURIComponent(query.trim())}`
                : 'https://sefon.pro/mp3/'
            }
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded-xl hover:bg-neutral-700 active:scale-95 transition"
          >
            {query.trim() ? `Найти «${query.trim().slice(0, 10)}»` : 'Открыть Sefon.pro'}{' '}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Здесь доступны любые редкие треки (например, весь альбом <b>N1NT3ND0</b>). Нажмите кнопку выше, скачайте MP3 файл в 1 клик и нажмите вверху плеера <b>«+ Добавить музыку»</b>.
        </p>

        {/* Or direct URL download */}
        <form onSubmit={handleDownloadUrl} className="flex gap-2 pt-2 border-t border-neutral-800/80">
          <input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="Вставить ссылку на mp3 файл..."
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            disabled={loading || !customUrl.trim()}
            className="px-4 py-2 bg-neutral-200 text-black font-bold text-xs rounded-xl disabled:opacity-40 active:scale-95 transition"
          >
            Скачать
          </button>
        </form>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-400 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
          <span className="text-xs">Ищем аудиозаписи во всех базах...</span>
        </div>
      )}

      {/* No results prompt */}
      {searched && !loading && results.length === 0 && (
        <div className="text-center py-8 px-4 bg-neutral-900/40 rounded-2xl border border-neutral-800/60 space-y-3">
          <p className="text-sm font-semibold text-white">В открытых стримингах этот трек ограничен</p>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
            Такие треки (как N1NT3ND0 – Олина попа) доступны на <b>Sefon.pro</b>. Нажмите кнопку выше «Найти на Sefon», скачайте MP3 и загрузите через «+ Добавить музыку».
          </p>
          <a
            href={`https://sefon.pro/search/?q=${encodeURIComponent(query.trim())}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-black rounded-xl text-xs font-bold active:scale-95 transition"
          >
            Найти «{query}» на Sefon.pro <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Results with Audio Preview & Download */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Найдено ({results.length})
            </h3>
            <span className="text-[11px] text-neutral-500">▶ Слушать • ⬇ Скачать</span>
          </div>

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
                      : 'bg-neutral-900/80 border-neutral-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden mr-2">
                    {/* Play / Preview Button */}
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
                        {res.artist} {res.album ? `• ${res.album}` : ''}
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
        </div>
      )}
    </div>
  );
};
