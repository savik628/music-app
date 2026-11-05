export interface SearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  audioUrl?: string;
  duration: number;
  source?: 'itunes' | 'archive' | 'soundcloud';
  soundcloudUrl?: string;
  soundcloudEmbedHtml?: string;
  isFullVersion?: boolean;
}

// Top Popular Songs Cache
let popularSongsCache: SearchTrack[] | null = null;

// Fetch Top Trending Songs for immediate display
export async function getPopularTracks(): Promise<SearchTrack[]> {
  if (popularSongsCache && popularSongsCache.length > 0) {
    return popularSongsCache;
  }

  const tracks: SearchTrack[] = [];
  const seen = new Set<string>();

  try {
    const res = await fetch('https://itunes.apple.com/ru/rss/topsongs/limit=30/json');
    const data = await res.json();
    const entries = data.feed?.entry || [];

    entries.forEach((e: any) => {
      const title = e['im:name']?.label || e.title?.label || 'Без названия';
      const artist = e['im:artist']?.label || 'Популярный артист';
      const key = `${artist} - ${title}`.toLowerCase();

      // Find audio preview
      const previewLink = e.link?.find((l: any) => l.attributes?.type?.startsWith('audio/'));
      const audioUrl = previewLink ? previewLink.attributes.href : undefined;

      // Find cover
      const images = e['im:image'] || [];
      const coverUrl = images.length > 0 ? images[images.length - 1].label : undefined;

      if (!seen.has(key) && audioUrl) {
        seen.add(key);
        tracks.push({
          id: `pop-${e.id?.attributes?.['im:id'] || Math.random().toString(36).substring(2, 7)}`,
          title,
          artist,
          album: e['im:collection']?.['im:name']?.label || 'Популярное',
          coverUrl: coverUrl ? coverUrl.replace(/\/\d+x\d+bb/, '/400x400bb') : undefined,
          audioUrl,
          duration: 30,
          source: 'itunes',
          isFullVersion: false,
        });
      }
    });
  } catch (err) {
    console.warn('Failed to load RSS top songs, using curated fallback:', err);
  }

  // Fallback if RSS empty
  if (tracks.length < 5) {
    const fallbackSearch = await searchTracks('Miyagi');
    tracks.push(...fallbackSearch.slice(0, 10));
  }

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
    const res = await fetch(oembedUrl);
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
      soundcloudUrl: cleanUrl,
      soundcloudEmbedHtml: data.html,
      isFullVersion: true,
    };
  } catch (err) {
    console.error('Error resolving SoundCloud track:', err);
    return null;
  }
}

// Cloudflare Worker API Base URL
export const WORKER_API_BASE = 'https://music-app.savelii-k28.workers.dev';

// Multi-catalog fast search: Cloudflare Worker (Full MP3), Open Audio Archive, iTunes RU & Global, SoundCloud
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

  // 2. Query Cloudflare Worker (Full MP3 tracks from Muzofond & SoundCloud)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const workerRes = await fetch(`${WORKER_API_BASE}/api/search?q=${encodedQuery}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (workerRes.ok) {
      const data = await workerRes.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        data.results.forEach((item: any) => {
          const key = `${item.artist} - ${item.title}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              id: item.id || `worker-${Math.random().toString(36).substring(2, 8)}`,
              title: item.title,
              artist: item.artist,
              album: item.album || 'Полный трек',
              duration: item.duration || 210,
              coverUrl: item.coverUrl,
              audioUrl: item.audioUrl,
              isFullVersion: true,
              source: item.source || 'muzofond',
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('Worker search skipped or timed out, using multi-source fallback:', err);
  }

  // If worker returned strong results (>= 3 tracks), return them right away!
  if (results.length >= 3) {
    return results;
  }

  // 3. Multi-source Fallback: Russia & Global iTunes + Open Archive
  try {
    const [ruRes, globalRes, archiveRes] = await Promise.allSettled([
      fetch(`https://itunes.apple.com/search?term=${encodedQuery}&country=ru&entity=song&limit=25`).then((r) => r.json()),
      fetch(`https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=25`).then((r) => r.json()),
      fetch(`https://archive.org/advancedsearch.php?q=(${encodedQuery})+AND+mediatype:audio&fl[]=identifier,title,creator,album&rows=15&output=json`).then((r) => r.json()),
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
