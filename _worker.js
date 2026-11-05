/**
 * Cloudflare Pages / Worker Advanced Mode
 * Serves /api/search and /api/stream dynamically, and static assets for everything else.
 */

const SC_CLIENT_ID = 'N5nHxilyZaG4XKY57pV0M6qx6JysgIFW';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 1. API: Search Music
    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const results = [];
      const seen = new Set();
      const qWords = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);

      // Search Muzofond
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

          for (let i = 1; i < rawItems.length && results.length < 25; i++) {
            const chunk = rawItems[i];
            const durationMatch = chunk.match(/data-duration="(\d+)"/);
            const playMatch = chunk.match(/<li class="play"[^>]*data-url="([^"]+)"/);
            const artistMatch = chunk.match(/<span class="artist">([\s\S]*?)<\/span>/);
            const trackMatch = chunk.match(/<span class="track">([\s\S]*?)<\/span>/);
            const imgMatch = chunk.match(/data-img="([^"]*)"/);

            if (playMatch && (artistMatch || trackMatch)) {
              const artist = artistMatch ? artistMatch[1].replace(/<[^>]+>/g, '').trim() : 'Музыка';
              const title = trackMatch ? trackMatch[1].replace(/<[^>]+>/g, '').trim() : 'Без названия';
              const fullText = `${artist} ${title}`.toLowerCase();

              const isRelevant = qWords.length === 0 || qWords.some((w) => fullText.includes(w));
              if (!isRelevant && results.length > 0) continue;

              const key = `${artist} - ${title}`.toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);

                const duration = durationMatch ? parseInt(durationMatch[1], 10) : 180;
                const rawStream = playMatch[1];
                const imgPath = imgMatch ? imgMatch[1] : '';

                let coverUrl = undefined;
                if (imgPath) {
                  coverUrl = imgPath.startsWith('http') ? imgPath : `https://muzofond.fm${imgPath}`;
                }

                results.push({
                  id: `mf-${results.length + 1}-${Date.now()}`,
                  title,
                  artist,
                  album: 'Полный трек MP3',
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

      // Search SoundCloud
      try {
        const scUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&limit=10&client_id=${SC_CLIENT_ID}`;
        const scRes = await fetch(scUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });

        if (scRes.ok) {
          const scData = await scRes.json();
          const items = scData.collection || [];
          for (const item of items) {
            const key = `${item.user?.username || ''} - ${item.title}`.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);

              let coverUrl = item.artwork_url;
              if (coverUrl) {
                coverUrl = coverUrl.replace(/-large\./, '-t500x500.');
              }

              results.push({
                id: `sc-${item.id}`,
                title: item.title,
                artist: item.user?.username || 'SoundCloud',
                album: 'SoundCloud',
                duration: Math.round((item.duration || 180000) / 1000),
                coverUrl,
                audioUrl: item.permalink_url,
                isFullVersion: true,
                source: 'soundcloud',
              });
            }
          }
        }
      } catch (err) {
        console.warn('SoundCloud search error:', err);
      }

      return new Response(JSON.stringify({ results }), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    // 2. API: Stream & Download Full Audio
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
      });

      const responseHeaders = new Headers(response.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));
      responseHeaders.set('Content-Type', 'audio/mpeg');

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // 3. Fallback to static assets
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  },
};
