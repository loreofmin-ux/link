// minimal youtube music client for share previews: the same public WEB_REMIX client
// the desktop app uses (src/shared/youtube/innertube/innertubeClient.ts), no cookies,
// no auth, read-only endpoints and a short timeout so a slow upstream never holds a page.

export const INNERTUBE_ORIGIN = 'https://music.youtube.com';

export const WEB_REMIX = {
  clientName: 'WEB_REMIX',
  clientVersion: '1.20260911.08.00',
  hl: 'en',
  gl: 'US',
};

const ENDPOINTS = new Set(['browse', 'next', 'player']);

export function createInnertube({ fetch = globalThis.fetch, timeoutMs = 2000 } = {}) {
  return async function innertube(endpoint, body) {
    if (!ENDPOINTS.has(endpoint)) throw new Error(`unsupported innertube endpoint: ${endpoint}`);
    const res = await fetch(`${INNERTUBE_ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        origin: INNERTUBE_ORIGIN,
        'x-origin': INNERTUBE_ORIGIN,
        'x-youtube-client-name': '67',
        'x-youtube-client-version': WEB_REMIX.clientVersion,
      },
      body: JSON.stringify({ ...body, context: { client: WEB_REMIX } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`innertube ${endpoint} failed with HTTP ${res.status}`);
    return res.json();
  };
}

// public json endpoints a resolver may read as a fallback (youtube oembed), nothing else
const JSON_ALLOWLIST = ['https://www.youtube.com/oembed?'];

export function createFetchJson({ fetch = globalThis.fetch, timeoutMs = 2000 } = {}) {
  return async function fetchJson(url) {
    if (!JSON_ALLOWLIST.some((prefix) => String(url).startsWith(prefix))) {
      throw new Error('url not allowed');
    }
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`fetch failed with HTTP ${res.status}`);
    return res.json();
  };
}
