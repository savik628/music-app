import React, { useState, useRef } from 'react';
import { Search as SearchIcon, Download, Loader2, Music, Check, Play, Pause, ExternalLink } from 'lucide-react';
import { saveTrack } from '../db';
import type { Track } from '../types';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  audioUrl: string;
  duration: number;
}

interface SearchTabProps {
  onTrackDownloaded: () => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({ onTrackDownloaded }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [customUrl, setCustomUrl] = useState('');
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop preview on unmount
  React.useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const togglePreview = (item: SearchResult) => {
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

  // Search logic (Apple Music / iTunes catalog + Archive fallback)
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewTrackId(null);
    }

    setLoading(true);
    setResults([]);

    try {
      // 1. Search high-quality iTunes catalog (complete with previews and HQ artwork)
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=30`
      );
      const itunesData = await itunesRes.json();

      const items: SearchResult[] = (itunesData.results || []).map((t: any) => ({
        id: String(t.trackId),
        title: t.trackName || 'Без названия',
        artist: t.artistName || 'Неизвестный исполнитель',
        album: t.collectionName || 'Сингл',
        coverUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : undefined,
        audioUrl: t.previewUrl,
        duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 30,
      }));

      // 2. If itunes had few results, combine with Archive.org
      if (items.length < 5) {
        try {
          const archRes = await fetch(
            `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
              query
            )}+AND+mediatype:audio&fl[]=identifier,title,creator,album&rows=15&output=json`
          );
          const archData = await archRes.json();
          const archDocs = archData.response?.docs || [];

          archDocs.forEach((d: any) => {
            items.push({
              id: `arch-${d.identifier}`,
              title: d.title || query,
              artist: d.creator || 'Архив',
              album: d.album || 'Интернет-архив',
              coverUrl: `https://archive.org/services/img/${d.identifier}`,
              audioUrl: `https://archive.org/download/${d.identifier}`,
              duration: 0,
            });
          });
        } catch {}
      }

      setResults(items);
    } catch (err) {
      console.error('Ошибка поиска:', err);
      alert('Ошибка при поиске. Проверьте интернет-соединение.');
    } finally {
      setLoading(false);
    }
  };

  // Download track directly into offline IndexedDB
  const handleDownload = async (item: SearchResult) => {
    setDownloadingId(item.id);
    try {
      let downloadUrl = item.audioUrl;

      // Handle archive.org item resolution if from archive
      if (item.id.startsWith('arch-')) {
        const archId = item.id.replace('arch-', '');
        const metaRes = await fetch(`https://archive.org/metadata/${archId}`);
        const meta = await metaRes.json();
        const mp3 = (meta.files || []).find((f: any) => f.name?.toLowerCase().endsWith('.mp3'));
        if (!mp3) throw new Error('MP3 не найден');
        downloadUrl = `https://archive.org/download/${archId}/${encodeURIComponent(mp3.name)}`;
      }

      // Fetch audio blob
      const res = await fetch(downloadUrl);
      const audioBlob = await res.blob();

      // Fetch cover blob
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
      alert('Не удалось скачать файл. Попробуйте скачать с Sefon и добавить через кнопку вверху.');
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
        artist: 'Прямая ссылка',
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
      alert('Не удалось скачать файл по ссылке. Убедитесь, что это прямая ссылка на аудиофайл.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-36">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="relative">
        <SearchIcon className="absolute left-3.5 top-3.5 w-5 h-5 text-neutral-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск треков и исполнителей..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-11 pr-24 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 transition"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-2 px-4 py-1.5 bg-white text-black text-xs font-bold rounded-lg disabled:opacity-40 active:scale-95 transition"
        >
          Искать
        </button>
      </form>

      {/* Sefon.pro Quick Link Box */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-white" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Источник музыки: Sefon.pro
            </span>
          </div>
          <a
            href="https://sefon.pro/mp3/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-bold text-white bg-neutral-800 px-3 py-1.5 rounded-lg hover:bg-neutral-700 active:scale-95 transition"
          >
            Открыть Sefon.pro <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Нажмите кнопку выше, чтобы открыть <b>Sefon.pro</b>, скачать любой трек на телефон в 1 клик, а затем нажать <b>«+ Добавить музыку»</b> в верхней панели плеера!
        </p>

        {/* Or direct download link */}
        <form onSubmit={handleDownloadUrl} className="flex gap-2 pt-1 border-t border-neutral-800">
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
        <div className="flex flex-col items-center justify-center py-10 text-neutral-400 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
          <span className="text-xs">Ищем аудиозаписи...</span>
        </div>
      )}

      {/* Results with Audio Preview & Download */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Результаты ({results.length})
            </h3>
            <span className="text-[11px] text-neutral-500">
              ▶ Прослушать • ⬇ Скачать
            </span>
          </div>

          <div className="space-y-1.5">
            {results.map((res) => {
              const isDownloaded = downloadedIds.has(res.id);
              const isDownloading = downloadingId === res.id;
              const isPreviewing = previewTrackId === res.id;

              return (
                <div
                  key={res.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                    isPreviewing
                      ? 'bg-neutral-800 border-neutral-600'
                      : 'bg-neutral-900 border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden mr-2">
                    {/* Play / Preview Button */}
                    <button
                      onClick={() => togglePreview(res)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 active:scale-95 transition ${
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
                        {res.artist} • {res.album}
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
