import * as mm from 'music-metadata-browser';
import type { Track } from './types';

export async function parseAudioFile(file: File): Promise<Track> {
  let title = file.name.replace(/\.[^/.]+$/, '');
  let artist = 'Неизвестный исполнитель';
  let album = 'Медиатека';
  let duration = 0;
  let year: number | undefined;
  let coverBlob: Blob | undefined;

  // Try parsing title & artist from filename if in "Артист - Трек" format
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  } else if (title.includes(' – ')) {
    const parts = title.split(' – ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' – ').trim();
  }

  // Fast timeout promise so huge files or corrupted tags don't hang iOS Safari
  try {
    const parsePromise = mm.parseBlob(file);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
    const metadata: any = await Promise.race([parsePromise, timeoutPromise]);

    if (metadata && metadata.common) {
      if (metadata.common.title) title = metadata.common.title;
      if (metadata.common.artist) artist = metadata.common.artist;
      if (metadata.common.album) album = metadata.common.album;
      if (metadata.common.year) year = metadata.common.year;
      if (metadata.format?.duration) duration = Math.round(metadata.format.duration);

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const pic = metadata.common.picture[0];
        coverBlob = new Blob([pic.data], { type: pic.format || 'image/jpeg' });
      }
    }
  } catch (err) {
    console.warn('ID3 parsing skipped/failed:', err);
  }

  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return {
    id,
    title,
    artist,
    album,
    duration,
    year,
    audioBlob: file,
    coverBlob,
    addedAt: Date.now(),
    isFavorite: false,
  };
}
