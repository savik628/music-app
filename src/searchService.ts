export interface SearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  audioUrl?: string;
  duration: number;
  source: 'itunes' | 'archive' | 'external';
  directDownloadUrl?: string;
}

// Multi-engine search that searches iTunes (Global + RU) + Internet Archive
export async function searchTracks(query: string): Promise<SearchTrack[]> {
  const q = query.trim();
  if (!q) return [];

  const results: SearchTrack[] = [];
  const seen = new Set<string>();

  const encodedQuery = encodeURIComponent(q);

  // 1. iTunes RU & US
  const itunesPromises = [
    fetch(`https://itunes.apple.com/search?term=${encodedQuery}&country=ru&entity=song&limit=40`)
      .then((r) => r.json())
      .catch(() => ({ results: [] })),
    fetch(`https://itunes.apple.com/search?term=${encodedQuery}&country=us&entity=song&limit=40`)
      .then((r) => r.json())
      .catch(() => ({ results: [] })),
  ];

  // 2. Internet Archive
  const archivePromise = fetch(
    `https://archive.org/advancedsearch.php?q=${encodedQuery}+AND+mediatype:audio&fl[]=identifier,title,creator,album&rows=25&output=json`
  )
    .then((r) => r.json())
    .catch(() => ({ response: { docs: [] } }));

  const [itunesRu, itunesUs, archiveRes] = await Promise.all([
    itunesPromises[0],
    itunesPromises[1],
    archivePromise,
  ]);

  const rawItunes = [...(itunesRu.results || []), ...(itunesUs.results || [])];
  rawItunes.forEach((t: any) => {
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

  // Process Archive.org results
  const archiveDocs = archiveRes?.response?.docs || [];
  archiveDocs.forEach((d: any) => {
    const key = `${d.creator || ''} - ${d.title || ''}`.toLowerCase();
    if (!seen.has(key) && d.identifier) {
      seen.add(key);
      results.push({
        id: `archive-${d.identifier}`,
        title: d.title || q,
        artist: d.creator || 'Аудиоархив',
        album: d.album || 'Интернет-архив',
        coverUrl: `https://archive.org/services/img/${d.identifier}`,
        audioUrl: `https://archive.org/download/${d.identifier}`,
        duration: 0,
        source: 'archive',
      });
    }
  });

  return results;
}
