import * as mm from 'music-metadata-browser';
import type { Track } from './types';

export async function parseAudioFile(file: File): Promise<Track> {
  let title = file.name.replace(/\.[^/.]+$/, '');
  let artist = 'Неизвестный исполнитель';
  let album = 'Неизвестный альбом';
  let duration = 0;
  let year: number | undefined;
  let coverBlob: Blob | undefined;

  try {
    const metadata = await mm.parseBlob(file);
    if (metadata.common.title) title = metadata.common.title;
    if (metadata.common.artist) artist = metadata.common.artist;
    if (metadata.common.album) album = metadata.common.album;
    if (metadata.common.year) year = metadata.common.year;
    if (metadata.format.duration) duration = Math.round(metadata.format.duration);

    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      coverBlob = new Blob([pic.data], { type: pic.format });
    }
  } catch (err) {
    console.warn('ID3 metadata parsing failed, fallback to file name:', err);
  }

  // Fallback for duration if not parsed
  if (!duration) {
    try {
      duration = await getAudioDuration(file);
    } catch {
      duration = 0;
    }
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

function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => {
      const dur = Math.round(audio.duration) || 0;
      URL.revokeObjectURL(url);
      resolve(dur);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve(0);
    });
  });
}
