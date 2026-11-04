export interface SearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  audioUrl?: string;
  duration: number;
  source: 'russian-archive' | 'itunes' | 'open-web';
}

// Deep Multi-Engine Search focusing on Russian Music catalogs & Open Audio
export async function searchTracks(query: string): Promise<SearchTrack[]> {
  const q = query.trim();
  if (!q) return [];

  const results: SearchTrack[] = [];
  const seen = new Set<string>();
  const encodedQuery = encodeURIComponent(q);

  try {
    // 1. Search Open Russian Audio Archive (full tracks including Скриптонит, Баста, etc.)
    const archivePromise = fetch(
      `https://archive.org/advancedsearch.php?q=(${encodedQuery})+AND+mediatype:audio&fl[]=identifier,title,creator,album&rows=30&output=json`
    )
      .then((r) => r.json())
      .catch(() => ({ response: { docs: [] } }));

    // 2. Search iTunes RU Store (high-definition metadata & 30s previews)
    const itunesRuPromise = fetch(
      `https://itunes.apple.com/search?term=${encodedQuery}&country=ru&entity=song&limit=40`
    )
      .then((r) => r.json())
      .catch(() => ({ results: [] }));

    // 3. Search iTunes Global (for western or international tracks)
    const itunesGlobalPromise = fetch(
      `https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=30`
    )
      .then((r) => r.json())
      .catch(() => ({ results: [] }));

    const [archiveRes, itunesRu, itunesGlobal] = await Promise.allSettled([
      archivePromise,
      itunesRuPromise,
      itunesGlobalPromise,
    ]);

    // Priority 1: Full Russian audio files from Archive
    if (archiveRes.status === 'fulfilled' && archiveRes.value?.response?.docs) {
      const docs = archiveRes.value.response.docs;
      docs.forEach((d: any) => {
        const rawTitle = d.title || q;
        const key = `${d.creator || ''} - ${rawTitle}`.toLowerCase();
        if (!seen.has(key) && d.identifier) {
          seen.add(key);

          // Extract artist from title if in format "Исполнитель – Название"
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
            source: 'russian-archive',
          });
        }
      });
    }

    // Priority 2: Russian & Global iTunes entries
    const itunesList: any[] = [];
    if (itunesRu.status === 'fulfilled' && itunesRu.value?.results) {
      itunesList.push(...itunesRu.value.results);
    }
    if (itunesGlobal.status === 'fulfilled' && itunesGlobal.value?.results) {
      itunesList.push(...itunesGlobal.value.results);
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
  } catch (err) {
    console.error('Multi-engine search error:', err);
  }

  return results;
}
