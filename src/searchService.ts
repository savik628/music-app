export interface SearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  audioUrl?: string;
  duration: number;
  source?: 'itunes' | 'archive' | 'soundcloud';
  isFullVersion?: boolean;
}

// Top Popular Songs Cache
let popularSongsCache: SearchTrack[] | null = null;

// Fetch Top Trending Songs for immediate display
export async function getPopularTracks(): Promise<SearchTrack[]> {
  if (popularSongsCache && popularSongsCache.length > 0) {
    return popularSongsCache;
  }

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}charts.json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.tracks) && data.tracks.length > 0) {
        popularSongsCache = data.tracks;
        return data.tracks;
      }
    }
  } catch (err) {
    console.warn('Failed to load charts.json, using fallback search:', err);
  }

  // Fallback search
  const fallbackSearch = await searchTracks('Miyagi');
  const tracks = fallbackSearch.slice(0, 10);
  popularSongsCache = tracks;
  return tracks;
}

/**
 * Detects if query is a SoundCloud link
 */
export function isSoundCloudUrl(query: string): boolean {
  return /soundcloud\.com\/[\w\-._]+\/[\w\-._]+/i.test(query.trim());
}

/**
 * Resolves metadata and artwork from a SoundCloud link using official CORS-friendly oEmbed
 */
export async function resolveSoundCloud(url: string): Promise<SearchTrack | null> {
  try {
    const cleanUrl = url.trim().replace(/^http:/, 'https:');
    const oembedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    let rawTitle = data.title || 'SoundCloud Track';
    let artist = data.author_name || 'SoundCloud';

    // Remove "by Author" suffix
    rawTitle = rawTitle.replace(/\s+by\s+.*$/i, '').trim();

    // Check if title has "Artist - Track"
    let title = rawTitle;
    if (rawTitle.includes(' - ')) {
      const parts = rawTitle.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    } else if (rawTitle.includes('–')) {
      const parts = rawTitle.split('–');
      artist = parts[0].trim();
      title = parts.slice(1).join('–').trim();
    }

    // High quality artwork (500x500)
    let coverUrl = data.thumbnail_url;
    if (coverUrl) {
      coverUrl = coverUrl.replace(/-large\./, '-t500x500.').replace(/-badge\./, '-t500x500.');
    }

    return {
      id: `sc-${Date.now()}`,
      title,
      artist,
      album: 'SoundCloud',
      coverUrl,
      duration: 210,
      source: 'soundcloud',
      isFullVersion: true,
    };
  } catch (err) {
    console.error('Error resolving SoundCloud track:', err);
    return null;
  }
}

// Multi-catalog search: iTunes RU & Global (30s preview), Open Audio Archive (Full MP3), SoundCloud
export async function searchTracks(query: string): Promise<SearchTrack[]> {
  const q = query.trim();
  if (!q) return [];

  // 1. Direct SoundCloud URL check
  if (isSoundCloudUrl(q)) {
    const scTrack = await resolveSoundCloud(q);
    if (scTrack) {
      return [scTrack];
    }
  }

  const results: SearchTrack[] = [];
  const seen = new Set<string>();
  const encodedQuery = encodeURIComponent(q);

  try {
    const [ruRes, globalRes, archiveRes] = await Promise.allSettled([
      fetch(`https://itunes.apple.com/search?term=${encodedQuery}&country=ru&entity=song&limit=25`, {
        signal: AbortSignal.timeout(10000),
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=25`, {
        signal: AbortSignal.timeout(10000),
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://archive.org/advancedsearch.php?q=(${encodedQuery})+AND+mediatype:audio&fl[]=identifier,title,creator,album&rows=15&output=json`, {
        signal: AbortSignal.timeout(10000),
      }).then((r) => (r.ok ? r.json() : null)),
    ]);

    // 1. Open Audio Archive items (Full MP3 songs)
    if (archiveRes.status === 'fulfilled' && archiveRes.value?.response?.docs) {
      const docs = archiveRes.value.response.docs;
      docs.forEach((d: any) => {
        const rawTitle = d.title || q;
        const key = `${d.creator || ''} - ${rawTitle}`.toLowerCase();
        if (!seen.has(key) && d.identifier) {
          seen.add(key);

          let artist = d.creator || 'Музыка';
          let title = rawTitle;
          if (rawTitle.includes('–')) {
            const parts = rawTitle.split('–');
            artist = parts[0].trim();
            title = parts.slice(1).join('–').trim();
          } else if (rawTitle.includes('-')) {
            const parts = rawTitle.split('-');
            artist = parts[0].trim();
            title = parts.slice(1).join('-').trim();
          }

          results.push({
            id: `arch-${d.identifier}`,
            title,
            artist,
            album: d.album || 'Медиатека',
            coverUrl: `https://archive.org/services/img/${d.identifier}`,
            audioUrl: `https://archive.org/download/${d.identifier}`,
            duration: 180,
            source: 'archive',
            isFullVersion: true,
          });
        }
      });
    }

    // 2. iTunes RU & Global (30s preview + original high-res cover)
    const itunesList: any[] = [];
    if (ruRes.status === 'fulfilled' && ruRes.value?.results) {
      itunesList.push(...ruRes.value.results);
    }
    if (globalRes.status === 'fulfilled' && globalRes.value?.results) {
      itunesList.push(...globalRes.value.results);
    }

    itunesList.forEach((t) => {
      const key = `${t.artistName} - ${t.trackName}`.toLowerCase();
      if (!seen.has(key) && t.previewUrl) {
        seen.add(key);
        results.push({
          id: `itunes-${t.trackId}`,
          title: t.trackName || 'Без названия',
          artist: t.artistName || 'Неизвестный исполнитель',
          album: t.collectionName || 'Сингл',
          coverUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : undefined,
          audioUrl: t.previewUrl,
          duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 30,
          source: 'itunes',
          isFullVersion: false,
        });
      }
    });
  } catch (err) {
    console.error('Search query error:', err);
  }

  return results;
}

/**
 * Picks best MP3 file from Archive.org metadata
 */
export function pickArchiveMp3(meta: any, archId?: string): { url: string; durationSec?: number } | null {
  if (!meta || !Array.isArray(meta.files)) return null;

  const id = archId || meta.metadata?.identifier || meta.identifier;
  const mp3Files = meta.files.filter((f: any) => typeof f.name === 'string' && f.name.toLowerCase().endsWith('.mp3'));
  if (mp3Files.length === 0) return null;

  const chosenFile = mp3Files.find((f: any) => f.source === 'original') || mp3Files[0];
  if (!chosenFile || !chosenFile.name) return null;

  const parsedLength = chosenFile.length ? parseFloat(chosenFile.length) : NaN;
  const durationSec = !isNaN(parsedLength) && isFinite(parsedLength)
    ? Math.round(parsedLength)
    : undefined;

  const url = id
    ? `https://archive.org/download/${id}/${encodeURIComponent(chosenFile.name)}`
    : `https://archive.org/download/${encodeURIComponent(chosenFile.name)}`;

  return { url, durationSec };
}

export interface SearchAlbum {
  id: string;
  collectionId: number | string;
  title: string;
  artist: string;
  coverUrl?: string;
  trackCount: number;
  releaseDate?: string;
  primaryGenreName?: string;
}

export interface AlbumTrackItem {
  id: string;
  trackNumber: number;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  duration: number;
  previewUrl?: string;
  audioUrl?: string;
  searchQuery?: string;
}

export async function searchAlbums(query: string): Promise<SearchAlbum[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const itUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=25&country=ru`;
    const res = await fetch(itUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      return (data.results || []).map((alb: any) => ({
        id: `alb-${alb.collectionId}`,
        collectionId: alb.collectionId,
        title: alb.collectionName,
        artist: alb.artistName,
        coverUrl: alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : undefined,
        trackCount: alb.trackCount || 0,
        releaseDate: alb.releaseDate ? alb.releaseDate.substring(0, 4) : '',
        primaryGenreName: alb.primaryGenreName,
      }));
    }
  } catch (err) {
    console.warn('Search albums error:', err);
  }

  return [];
}

export async function getAlbumTracks(collectionId: string | number): Promise<{ album: any; tracks: AlbumTrackItem[] }> {
  try {
    const lookupUrl = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=ru`;
    const res = await fetch(lookupUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      const items = data.results || [];
      const albumMeta = items[0] || {};
      const rawTracks = items.slice(1);
      const tracks: AlbumTrackItem[] = rawTracks.map((t: any, idx: number) => ({
        id: `track-${t.trackId || idx}`,
        trackNumber: t.trackNumber || idx + 1,
        title: t.trackName,
        artist: t.artistName,
        album: albumMeta.collectionName || t.collectionName,
        coverUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : undefined,
        duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 210,
        previewUrl: t.previewUrl,
        audioUrl: t.previewUrl,
        searchQuery: `${t.artistName} ${t.trackName}`,
      }));
      return { album: albumMeta, tracks };
    }
  } catch (err) {
    console.warn('Get album tracks error:', err);
  }

  return { album: {}, tracks: [] };
}
