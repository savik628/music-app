import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Track, Playlist } from './types';

interface MusicDB extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: {
      'by-artist': string;
      'by-album': string;
      'by-added': number;
    };
  };
  playlists: {
    key: string;
    value: Playlist;
  };
}

let dbPromise: Promise<IDBPDatabase<MusicDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MusicDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MusicDB>('music-player-db', 1, {
      upgrade(db) {
        const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
        trackStore.createIndex('by-artist', 'artist');
        trackStore.createIndex('by-album', 'album');
        trackStore.createIndex('by-added', 'addedAt');

        db.createObjectStore('playlists', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

// Request persistent storage on iOS Safari so OS never wipes IndexedDB
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log('IndexedDB persistent storage status:', isPersisted);
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}

// Calculate used storage bytes and available quota
export async function getStorageEstimate(): Promise<{ usedBytes: number; quotaBytes: number; isPersisted: boolean }> {
  let usedBytes = 0;
  let quotaBytes = 0;
  let isPersisted = false;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    if (navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        usedBytes = est.usage || 0;
        quotaBytes = est.quota || 0;
      } catch {}
    }
    if (navigator.storage.persisted) {
      try {
        isPersisted = await navigator.storage.persisted();
      } catch {}
    }
  }

  return { usedBytes, quotaBytes, isPersisted };
}

export async function saveTrack(track: Track): Promise<void> {
  const db = await getDB();
  await db.put('tracks', track);
}

export async function updateTrackMetadata(
  id: string,
  updates: { title: string; artist: string; album: string; coverBlob?: Blob }
): Promise<Track | null> {
  const db = await getDB();
  const track = await db.get('tracks', id);
  if (!track) return null;

  track.title = updates.title.trim() || track.title;
  track.artist = updates.artist.trim() || track.artist;
  track.album = updates.album.trim() || track.album;
  if (updates.coverBlob) {
    track.coverBlob = updates.coverBlob;
  }

  await db.put('tracks', track);
  return track;
}

export async function getAllTracks(): Promise<Track[]> {
  const db = await getDB();
  const tracks = await db.getAll('tracks');
  return tracks.sort((a, b) => b.addedAt - a.addedAt);
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('tracks', id);
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const db = await getDB();
  const track = await db.get('tracks', id);
  if (!track) return false;
  track.isFavorite = !track.isFavorite;
  await db.put('tracks', track);
  return track.isFavorite;
}

// Custom Albums / Playlists API
export async function savePlaylist(playlist: Playlist): Promise<void> {
  const db = await getDB();
  await db.put('playlists', playlist);
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  const db = await getDB();
  const list = await db.getAll('playlists');
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deletePlaylist(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('playlists', id);
}

export async function addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
  const db = await getDB();
  const playlist = await db.get('playlists', playlistId);
  if (playlist) {
    if (!playlist.trackIds.includes(trackId)) {
      playlist.trackIds.push(trackId);
      await db.put('playlists', playlist);
    }
  }
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  const db = await getDB();
  const playlist = await db.get('playlists', playlistId);
  if (playlist) {
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    await db.put('playlists', playlist);
  }
}
