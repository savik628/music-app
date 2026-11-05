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
          coverUrl: coverUrl ? coverUrl.replace(/\/\d+x\d+bb/, '/300x300bb') : undefined,
          audioUrl,
          duration: 30,
          source: 'itunes',
        });
      }
    });
  } catch (err) {
    console.warn('Failed to load RSS top songs, using curated fallback:', err);
  }

  // If RSS failed or returned little, provide solid popular fallback
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

    // Remove "by Author" suffix if added by SoundCloud oembed
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

    // High quality artwork (500x500 instead of default small thumbnail)
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
      duration: 180,
      source: 'soundcloud',
      soundcloudUrl: cleanUrl,
      soundcloudEmbedHtml: data.html,
    };
  } catch (err) {
    console.error('Error resolving SoundCloud track:', err);
    return null;
  }
}

// Multi-catalog fast search: iTunes RU + US, Archive.org, and SoundCloud resolution
export async function searchTracks(query: string): Promise<SearchTrack[]> {
  const q = query.trim();
  if (!q) return [];

  // 1. Direct SoundCloud URL check
  if (isSoundCloudUrl(q)) {
    const scTrack = await resolveSoundCloud(q);
    if (scTrack) {
      // Also try to find audio stream / preview for this track in audio archives
      const related = await searchTracks(`${scTrack.artist} ${scTrack.title}`);
      const audioMatch = related.find((t) => t.audioUrl);
      if (audioMatch) {
        scTrack.audioUrl = audioMatch.audioUrl;
        if (!scTrack.duration || scTrack.duration === 180) {
          scTrack.duration = audioMatch.duration;
        }
      }
      return [scTrack, ...related.slice(0, 15)];
    }
  }

  const results: SearchTrack[] = [];
  const seen = new Set<string>();
  const encodedQuery = encodeURIComponent(q);

  try {
    // Search Russia & Global catalog simultaneously
    const [ruRes, globalRes, archiveRes] = await Promise.allSettled([
      fetch(`https://itunes.apple.com/search?term=${encodedQuery}&country=ru&entity=song&limit=25`).then((r) => r.json()),
      fetch(`https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=25`).then((r) => r.json()),
      fetch(`https://archive.org/advancedsearch.php?q=(${encodedQuery})+AND+mediatype:audio&fl[]=identifier,title,creator,album&rows=15&output=json`).then((r) => r.json()),
    ]);

    // 1. iTunes RU & Global
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
        });
      }
    });

    // 2. Open Audio Archive items
    if (archiveRes.status === 'fulfilled' && archiveRes.value?.response?.docs) {
      const docs = archiveRes.value.response.docs;
      docs.forEach((d: any) => {
        const rawTitle = d.title || q;
        const key = `${d.creator || ''} - ${rawTitle}`.toLowerCase();
        if (!seen.has(key) && d.identifier) {
          seen.add(key);

          let artist = d.creator || 'Русская музыка';
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
            duration: 0,
            source: 'archive',
          });
        }
      });
    }
  } catch (err) {
    console.error('Search query error:', err);
  }

  return results;
}
