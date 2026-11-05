/**
 * Cover Service: Automatically finds high-resolution artworks / covers
 * for tracks that don't have an embedded cover image.
 */

function cleanName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\.(mp3|m4a|aac|wav|flac|ogg)$/i, '')
    .replace(/\[(official|video|audio|lyrics|hd|4k|hq|remix|slowed)[^\]]*\]/gi, '')
    .replace(/\((official|video|audio|lyrics|hd|4k|hq|remix|slowed|bonus)[^)]*\)/gi, '')
    .replace(/feat\..*$/i, '')
    .replace(/ft\..*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBlobWithTimeout(url: string, timeoutMs = 4000): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Searches online for an album cover / artwork using iTunes and Deezer catalogs
 */
export async function searchCoverOnline(artist: string, title: string): Promise<Blob | null> {
  const cArtist = cleanName(artist);
  const cTitle = cleanName(title);

  // Queries in order of precision
  const searchQueries: string[] = [];

  if (cArtist && cTitle && cArtist !== 'Неизвестный исполнитель') {
    searchQueries.push(`${cArtist} ${cTitle}`);
  }
  if (cTitle) {
    searchQueries.push(cTitle);
  }
  if (cArtist && cArtist !== 'Неизвестный исполнитель') {
    searchQueries.push(cArtist);
  }

  // 1. Try iTunes Search API
  for (const q of searchQueries) {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=3`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        for (const item of results) {
          if (item.artworkUrl100) {
            // Upgrade resolution to 600x600 for sharp Retina displays
            const hiresUrl = item.artworkUrl100.replace(/100x100bb/, '600x600bb');
            const blob = await fetchBlobWithTimeout(hiresUrl);
            if (blob && blob.size > 1000) {
              return blob;
            }
          }
        }
      }
    } catch {}
  }

  // 2. Try iTunes Album search as fallback
  if (cArtist && cArtist !== 'Неизвестный исполнитель') {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cArtist)}&entity=album&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const first = data.results?.[0];
        if (first?.artworkUrl100) {
          const hiresUrl = first.artworkUrl100.replace(/100x100bb/, '600x600bb');
          const blob = await fetchBlobWithTimeout(hiresUrl);
          if (blob && blob.size > 1000) return blob;
        }
      }
    } catch {}
  }

  return null;
}
