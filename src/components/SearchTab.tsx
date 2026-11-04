import React, { useState } from 'react';
import { Search as SearchIcon, Download, Loader2, Music } from 'lucide-react';
import { saveTrack } from '../db';
import type { Track } from '../types';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  downloadUrl?: string;
}

interface SearchTabProps {
  onTrackDownloaded: () => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({ onTrackDownloaded }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');

  // Search through public open API / audio repository
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResults([]);

    try {
      // Free public audio search API (Free Music Archive / Archive.org open collection)
      const res = await fetch(
        `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
          query
        )}+AND+mediatype:audio&fl[]=identifier,title,creator,length&rows=20&output=json`
      );
      const data = await res.json();

      const items: SearchResult[] = (data.response?.docs || []).map((doc: any) => ({
        id: doc.identifier,
        title: doc.title || 'Без названия',
        artist: doc.creator || 'Неизвестный исполнитель',
        duration: doc.length ? parseInt(doc.length, 10) : 0,
      }));

      setResults(items);
    } catch (err) {
      console.error('Ошибка поиска:', err);
    } finally {
      setLoading(false);
    }
  };

  // Direct download by Audio URL (direct MP3/AAC)
  const handleDownloadUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(customUrl);
      const blob = await res.blob();
      const trackName = customUrl.split('/').pop()?.split('?')[0] || 'Скачанный трек';

      const newTrack: Track = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: decodeURIComponent(trackName.replace(/\.[^/.]+$/, '')),
        artist: 'Загрузка по ссылке',
        album: 'Загрузки',
        duration: 0,
        audioBlob: blob,
        addedAt: Date.now(),
      };

      await saveTrack(newTrack);
      setCustomUrl('');
      onTrackDownloaded();
      alert('Трек успешно сохранен в офлайн!');
    } catch (err) {
      alert('Не удалось скачать файл по ссылке (проверьте URL или CORS)');
    } finally {
      setLoading(false);
    }
  };

  // Download from archive.org stream
  const handleDownloadArchiveItem = async (item: SearchResult) => {
    setDownloadingId(item.id);
    try {
      // Find MP3 file from archive.org metadata
      const metaRes = await fetch(`https://archive.org/metadata/${item.id}`);
      const meta = await metaRes.json();
      const mp3File = meta.files?.find((f: any) => f.name?.toLowerCase().endsWith('.mp3'));

      if (!mp3File) {
        alert('MP3 версия этого трека не найдена');
        return;
      }

      const downloadUrl = `https://archive.org/download/${item.id}/${encodeURIComponent(mp3File.name)}`;
      const audioRes = await fetch(downloadUrl);
      const audioBlob = await audioRes.blob();

      const newTrack: Track = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: item.title,
        artist: item.artist,
        album: 'Интернет-загрузки',
        duration: item.duration,
        audioBlob: audioBlob,
        addedAt: Date.now(),
      };

      await saveTrack(newTrack);
      onTrackDownloaded();
    } catch (err) {
      console.error('Ошибка загрузки:', err);
      alert('Не удалось скачать трек в память устройства');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Search Input */}
      <form onSubmit={handleSearch} className="relative">
        <SearchIcon className="absolute left-3.5 top-3 w-5 h-5 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск музыки в открытых источниках..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
        />
      </form>

      {/* Direct URL Download Box */}
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">Прямое скачивание по ссылке</h3>
        <p className="text-xs text-neutral-500">
          Вставьте прямую ссылку на аудиофайл (mp3, aac, wav) для сохранения в офлайн:
        </p>
        <form onSubmit={handleDownloadUrl} className="flex gap-2">
          <input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://example.com/song.mp3"
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-700"
          />
          <button
            type="submit"
            disabled={loading || !customUrl.trim()}
            className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl disabled:opacity-50 active:scale-95 transition"
          >
            Скачать
          </button>
        </form>
      </div>

      {/* Search Results */}
      {loading && (
        <div className="flex justify-center py-8 text-neutral-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-400 px-1">Найдено</h3>
          <div className="space-y-1">
            {results.map((res) => (
              <div
                key={res.id}
                className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/40 hover:bg-neutral-900 transition"
              >
                <div className="flex items-center gap-3 overflow-hidden mr-3">
                  <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0 text-neutral-400">
                    <Music className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium text-white truncate">{res.title}</p>
                    <p className="text-xs text-neutral-400 truncate">{res.artist}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleDownloadArchiveItem(res)}
                  disabled={downloadingId === res.id}
                  className="p-2.5 bg-neutral-800 rounded-xl text-white hover:bg-white hover:text-black active:scale-95 transition flex-shrink-0"
                >
                  {downloadingId === res.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
