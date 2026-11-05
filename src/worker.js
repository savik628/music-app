/**
 * Cloudflare Worker for Music App
 * Handles /api/search, /api/stream, /api/albums, /api/album-tracks
 * Falls back to static assets (env.ASSETS)
 */

const SC_CLIENT_ID = 'N5nHxilyZaG4XKY57pV0M6qx6JysgIFW';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

// Words indicating garbage, low-quality ringtones, radio promos
const JUNK_WORDS = [
  'рингтон',
  'ringtone',
  'на звонок',
  'радио',
  'radio edit',
  'cut',
  'short',
  'тизер',
  'teaser',
  'bassboosted',
  'bass boosted',
  'speed up',
  'slowed',
  'tiktok',
  'отрывок',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 1. API: Search Single Tracks
    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const results = [];
      const seen = new Set();
      const qLower = q.toLowerCase();
      const qWords = qLower.split(/\s+/).filter((w) => w.length > 1);
      const isUserLookingForRemix = qLower.includes('remix') || qLower.includes('ремикс');

      // Search Muzofond for full MP3 studio tracks
      try {
        const searchUrl = `https://muzofond.fm/search/${encodeURIComponent(q)}`;
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          redirect: 'follow',
        });

        if (res.ok) {
          const html = await res.text();
          const rawItems = html.split(/<li class="item/);

          for (let i = 1; i < rawItems.length && results.length < 30; i++) {
            const chunk = rawItems[i];
            const durationMatch = chunk.match(/data-duration="(\d+)"/);
            const playMatch = chunk.match(/<li class="play"[^>]*data-url="([^"]+)"/);
            const artistMatch = chunk.match(/<span class="artist">([\s\S]*?)<\/span>/);
            const trackMatch = chunk.match(/<span class="track">([\s\S]*?)<\/span>/);
            const imgMatch = chunk.match(/data-img="([^"]*)"/);

            if (playMatch && (artistMatch || trackMatch)) {
              const artist = artistMatch ? artistMatch[1].replace(/<[^>]+>/g, '').trim() : 'Музыка';
              const title = trackMatch ? trackMatch[1].replace(/<[^>]+>/g, '').trim() : 'Без названия';
              const duration = durationMatch ? parseInt(durationMatch[1], 10) : 180;
              const fullText = `${artist} ${title}`.toLowerCase();

              // 1. Exclude ringtones and short promos (< 90 seconds)
              if (duration < 90) continue;

              // 2. Exclude garbage words unless user asked for them
              if (!isUserLookingForRemix) {
                const hasJunk = JUNK_WORDS.some((junk) => fullText.includes(junk));
                if (hasJunk) continue;
                if (fullText.includes('remix') || fullText.includes('ремикс')) continue;
              }

              // 3. Relevance check: artist or title must have query words
              const isRelevant = qWords.length === 0 || qWords.some((w) => fullText.includes(w));
              if (!isRelevant && results.length > 0) continue;

              const key = `${artist} - ${title}`.toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);

                const rawStream = playMatch[1];
                const imgPath = imgMatch ? imgMatch[1] : '';

                let coverUrl = undefined;
                if (imgPath && !imgPath.includes('unknown_artist')) {
                  coverUrl = imgPath.startsWith('http') ? imgPath : `https://muzofond.fm${imgPath}`;
                }

                results.push({
                  id: `mf-${results.length + 1}-${Date.now()}`,
                  title,
                  artist,
                  album: 'Оригинальный трек',
                  duration,
                  coverUrl,
                  audioUrl: `${url.origin}/api/stream?url=${encodeURIComponent(rawStream)}`,
                  isFullVersion: true,
                  source: 'muzofond',
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('Muzofond search error:', err);
      }

      // Fallback: If Muzofond returned 0 results, search SoundCloud
      if (results.length === 0) {
        try {
          const scUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&limit=10&client_id=${SC_CLIENT_ID}`;
          const scRes = await fetch(scUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
          });

          if (scRes.ok) {
            const scData = await scRes.json();
            for (const item of scData.collection || []) {
              const durSec = Math.round((item.duration || 180000) / 1000);
              if (durSec < 90) continue;

              let coverUrl = item.artwork_url;
              if (coverUrl) coverUrl = coverUrl.replace(/-large\./, '-t500x500.');

              results.push({
                id: `sc-${item.id}`,
                title: item.title,
                artist: item.user?.username || 'SoundCloud',
                album: 'SoundCloud',
                duration: durSec,
                coverUrl,
                audioUrl: item.permalink_url,
                isFullVersion: true,
                source: 'soundcloud',
              });
            }
          }
        } catch (err) {
          console.warn('SoundCloud search error:', err);
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    // 2. API: Search Official Discography / Albums
    if (url.pathname === '/api/albums') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) {
        return new Response(JSON.stringify({ albums: [] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      try {
        const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&country=ru&limit=25`;
        const itRes = await fetch(itunesUrl);
        if (itRes.ok) {
          const itData = await itRes.json();
          const albums = (itData.results || []).map((alb) => ({
            id: `alb-${alb.collectionId}`,
            collectionId: alb.collectionId,
            title: alb.collectionName,
            artist: alb.artistName,
            coverUrl: alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : undefined,
            trackCount: alb.trackCount || 0,
            releaseDate: alb.releaseDate ? alb.releaseDate.substring(0, 4) : '',
            primaryGenreName: alb.primaryGenreName,
          }));

          return new Response(JSON.stringify({ albums }), {
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
            },
          });
        }
      } catch (err) {
        console.warn('Albums search error:', err);
      }

      return new Response(JSON.stringify({ albums: [] }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. API: Get Album Tracks with full audio stream resolution
    if (url.pathname === '/api/album-tracks') {
      const collectionId = url.searchParams.get('id');
      if (!collectionId) {
        return new Response(JSON.stringify({ tracks: [] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song`;
        const res = await fetch(lookupUrl);
        if (res.ok) {
          const data = await res.json();
          const items = data.results || [];
          const albumMeta = items[0] || {};
          const rawTracks = items.slice(1);

          const tracks = [];
          for (const t of rawTracks) {
            tracks.push({
              id: `track-${t.trackId}`,
              trackNumber: t.trackNumber || tracks.length + 1,
              title: t.trackName,
              artist: t.artistName,
              album: albumMeta.collectionName || t.collectionName,
              coverUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : undefined,
              duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 210,
              searchQuery: `${t.artistName} ${t.trackName}`,
            });
          }

          return new Response(JSON.stringify({ album: albumMeta, tracks }), {
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
            },
          });
        }
      } catch (err) {
        console.warn('Album tracks lookup error:', err);
      }

      return new Response(JSON.stringify({ tracks: [] }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 4. API: Stream Audio without CORS
    if (url.pathname === '/api/stream') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return new Response('Missing audio url', { status: 400 });
      }

      const forwardHeaders = new Headers();
      if (request.headers.has('range')) {
        forwardHeaders.set('range', request.headers.get('range'));
      }
      forwardHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      forwardHeaders.set('Referer', 'https://muzofond.fm/');

      const response = await fetch(targetUrl, {
        headers: forwardHeaders,
        redirect: 'follow',
      });

      const responseHeaders = new Headers(response.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));
      responseHeaders.set('Content-Type', 'audio/mpeg');

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // 5. Fallback to static assets
    if (env && env.ASSETS) {
      // Rewrite /music-app/ paths if accessed directly on worker domain
      let assetRequest = request;
      if (url.pathname.startsWith('/music-app/')) {
        const rewrittenUrl = new URL(request.url);
        rewrittenUrl.pathname = url.pathname.replace(/^\/music-app/, '') || '/';
        assetRequest = new Request(rewrittenUrl, request);
      }

      const assetRes = await env.ASSETS.fetch(assetRequest);
      // SPA fallback: return index.html for extensionless GET requests
      if (assetRes.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
        const indexUrl = new URL('/', request.url);
        return env.ASSETS.fetch(new Request(indexUrl, request));
      }

      return assetRes;
    }

    return fetch(request);
  },
};
