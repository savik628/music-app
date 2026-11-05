const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
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
