import { writeFile } from 'node:fs/promises';

const RSS_URL = 'https://rss.marketingtools.apple.com/api/v2/ru/music/most-played/50/songs.json';
const OUTPUT_FILE = new URL('../public/charts.json', import.meta.url);

async function fetchCharts() {
  try {
    const rssRes = await fetch(RSS_URL, { signal: AbortSignal.timeout(15000) });
    if (!rssRes.ok) throw new Error(`RSS response status: ${rssRes.status}`);

    const rssData = await rssRes.json();
    const rawItems = rssData?.feed?.results || [];
    const ids = rawItems.map((item) => item.id).filter(Boolean);

    if (ids.length === 0) throw new Error('No track IDs found in RSS feed');

    const lookupUrl = `https://itunes.apple.com/lookup?id=${ids.join(',')}&country=ru&entity=song`;
    const lookupRes = await fetch(lookupUrl, { signal: AbortSignal.timeout(15000) });
    if (!lookupRes.ok) throw new Error(`Lookup response status: ${lookupRes.status}`);

    const lookupData = await lookupRes.json();
    const lookupMap = new Map();
    for (const t of lookupData?.results || []) {
      if (t.trackId) lookupMap.set(String(t.trackId), t);
    }

    const tracks = [];
    for (const item of rawItems) {
      const t = lookupMap.get(String(item.id));
      if (t?.previewUrl) {
        tracks.push({
          id: `chart-${t.trackId}`,
          title: t.trackName || item.name || 'Без названия',
          artist: t.artistName || item.artistName || 'Неизвестный исполнитель',
          album: t.collectionName || 'Сингл',
          coverUrl: t.artworkUrl100
            ? t.artworkUrl100.replace('100x100bb', '600x600bb')
            : item.artworkUrl100?.replace('100x100bb', '600x600bb'),
          audioUrl: t.previewUrl,
          duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 30,
          source: 'itunes',
          isFullVersion: false,
        });
      }
    }

    if (tracks.length < 10) {
      console.warn(`Charts: found only ${tracks.length} tracks (< 10), skipping file write`);
      process.exit(0);
    }

    const payload = JSON.stringify({ updated: new Date().toISOString(), tracks });
    await writeFile(OUTPUT_FILE, payload, 'utf-8');
    console.log(`Charts: successfully saved ${tracks.length} tracks to charts.json`);
  } catch (err) {
    console.warn('Charts: failed to update charts, keeping existing file:', err?.message || err);
    process.exit(0);
  }
}

fetchCharts();
