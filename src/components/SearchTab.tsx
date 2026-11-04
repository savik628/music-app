import React, { useState } from 'react';
import { Search as SearchIcon, Download, Loader2, Music, Check, Globe, HelpCircle } from 'lucide-react';
import { saveTrack } from '../db';
import type { Track } from '../types';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  audioUrl?: string;
  source: 'archive' | 'direct';
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Search through free public audio catalog (Internet Archive music repository)
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResults([]);
    setStatusMessage(null);

    try {
      const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
        query
      )}+AND+mediatype:audio&fl[]=identifier,title,creator,album,description&rows=25&output=json`;

      const res = await fetch(searchUrl);
      const data = await res.json();
      const docs = data.response?.docs || [];

      if (docs.length === 0) {
        setStatusMessage('По вашему запросу ничего не найдено.');
      } else {
        const items: SearchResult[] = docs.map((doc: any) => ({
          id: doc.identifier,
          title: doc.title || query,
          artist: doc.creator || 'Неизвестный исполнитель',
          album: doc.album || 'Интернет-архив',
          coverUrl: `https://archive.org/services/img/${doc.identifier}`,
          source: 'archive',
        }));
        setResults(items);
      }
    } catch (err) {
      console.error('Ошибка поиска:', err);
      setStatusMessage('Ошибка подключения к каталогу. Проверьте сеть.');
    } finally {
      setLoading(false);
    }
  };

  // Download Archive item
  const handleDownloadArchive = async (item: SearchResult) => {
    setDownloadingId(item.id);
    try {
      // 1. Get file list
      const metaRes = await fetch(`https://archive.org/metadata/${item.id}`);
      const meta = await metaRes.json();
      const files: any[] = meta.files || [];

      // Find mp3 or audio file
      const audioFile = files.find(
        (f) =>
          f.name?.toLowerCase().endsWith('.mp3') ||
          f.name?.toLowerCase().endsWith('.m4a') ||
          f.name?.toLowerCase().endsWith('.ogg')
      );

      if (!audioFile) {
        alert('Для этого трека нет прямого MP3 файла для скачивания.');
        setDownloadingId(null);
        return;
      }

      // Download audio blob
      const audioUrl = `https://archive.org/download/${item.id}/${encodeURIComponent(audioFile.name)}`;
      const audioRes = await fetch(audioUrl);
      const audioBlob = await audioRes.blob();

      // Download cover blob if available
      let coverBlob: Blob | undefined;
      try {
        if (item.coverUrl) {
          const coverRes = await fetch(item.coverUrl);
          if (coverRes.ok) coverBlob = await coverRes.blob();
        }
      } catch {
        // ignore cover failure
      }

      const newTrack: Track = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration: audioFile.length ? parseInt(audioFile.length, 10) : 0,
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
      alert('Не удалось скачать файл. Попробуйте другой результат.');
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
      if (!res.ok) throw new Error('Ошибка загрузки');
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
      alert('Трек сохранен в офлайн-медиатеку!');
    } catch {
      alert('Не удалось скачать по этой ссылке. Убедитесь, что это прямая ссылка на MP3/M4A файл.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-36">
      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="relative">
        <SearchIcon className="absolute left-3.5 top-3.5 w-5 h-5 text-neutral-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск треков или исполнителей..."
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

      {/* Free Music Sites & Direct URL */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-white" />
          <h3 className="text-sm font-bold text-white">Где брать бесплатную музыку без подписок:</h3>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Вы можете скачать MP3 на любом из этих проверенных открытых сайтов и нажать <b>«Добавить музыку»</b> вверху, либо вставить прямую ссылку на трек ниже:
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <a
            href="https://freemusicarchive.org"
            target="_blank"
            rel="noreferrer"
            className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-semibold text-center hover:border-neutral-600 transition"
          >
            Free Music Archive ↗
          </a>
          <a
            href="https://archive.org/details/audio"
            target="_blank"
            rel="noreferrer"
            className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-semibold text-center hover:border-neutral-600 transition"
          >
            Internet Archive ↗
          </a>
          <a
            href="https://pixabay.com/music/"
            target="_blank"
            rel="noreferrer"
            className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-semibold text-center hover:border-neutral-600 transition"
          >
            Pixabay Music ↗
          </a>
          <a
            href="https://incompetech.com"
            target="_blank"
            rel="noreferrer"
            className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-semibold text-center hover:border-neutral-600 transition"
          >
            Incompetech ↗
          </a>
        </div>

        {/* Direct Link Form */}
        <div className="pt-2 border-t border-neutral-800 space-y-2">
          <label className="text-[11px] uppercase font-bold tracking-wider text-neutral-400">
            Скачать по прямой ссылке (MP3 / M4A)
          </label>
          <form onSubmit={handleDownloadUrl} className="flex gap-2">
            <input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://site.com/track.mp3"
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
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-10 text-neutral-400 space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
          <span className="text-xs">Ищем аудиофайлы...</span>
        </div>
      )}

      {/* Status / empty */}
      {statusMessage && !loading && (
        <div className="text-center py-6 text-xs text-neutral-400">{statusMessage}</div>
      )}

      {/* Search results list */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Найдено ({results.length})
            </h3>
            <span className="text-[11px] text-neutral-500">Нажмите ⬇ чтобы скачать в офлайн</span>
          </div>

          <div className="space-y-1.5">
            {results.map((res) => {
              const isDownloaded = downloadedIds.has(res.id);
              const isDownloading = downloadingId === res.id;

              return (
                <div
                  key={res.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-neutral-800/80 transition"
                >
                  <div className="flex items-center gap-3 overflow-hidden mr-3">
                    {res.coverUrl ? (
                      <img
                        src={res.coverUrl}
                        alt={res.title}
                        className="w-11 h-11 rounded-lg object-cover bg-neutral-800 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0 text-neutral-400">
                        <Music className="w-5 h-5" />
                      </div>
                    )}

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
                    onClick={() => handleDownloadArchive(res)}
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
