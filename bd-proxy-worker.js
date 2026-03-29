/**
 * KC NOW — Battledome Live Proxy
 * Cloudflare Worker
 *
 * DEPLOY INSTRUCTIONS:
 * 1. Go to https://dash.cloudflare.com → Workers & Pages → Create
 * 2. Create a new Worker, paste this entire file, click Deploy
 * 3. Copy the worker URL (e.g. https://bd-proxy.YOUR-NAME.workers.dev)
 * 4. In kcnow.html find the line:
 *        const BD_PROXY_URL = '';
 *    and set it to your worker URL:
 *        const BD_PROXY_URL = 'https://bd-proxy.YOUR-NAME.workers.dev';
 *
 * Endpoints this worker proxies:
 *   GET /?region=East  → http://206.221.176.241:444/bdinfo.json
 *   GET /?region=EU    → http://51.91.19.175:444/bdinfo.json
 *   GET /health        → { ok: true }
 *
 * Cache: 15 seconds in-memory (per isolate). Upstream timeout: 10 seconds.
 * CORS: open (*) — restrict to your domain in production if desired.
 */

const UPSTREAM = {
  East: 'http://206.221.176.241:444/bdinfo.json',
  EU:   'http://51.91.19.175:444/bdinfo.json',
};

const CACHE_TTL_MS = 15_000;
const TIMEOUT_MS   = 10_000;

// Per-isolate in-memory cache (resets on cold start, shared within same isolate)
const _cache = {};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extra },
  });
}

async function fetchUpstream(region) {
  const url = UPSTREAM[region];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health check
    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, ts: Date.now() });
    }

    const region = url.searchParams.get('region');
    if (!region || !UPSTREAM[region]) {
      return jsonResponse(
        { error: 'Bad request', message: 'region must be "East" or "EU"' },
        400
      );
    }

    // Serve from cache if fresh
    const cached = _cache[region];
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return jsonResponse(cached.data, 200, { 'X-Cache': 'HIT', 'X-Cache-Age': String(Date.now() - cached.ts) });
    }

    // Fetch upstream
    try {
      const data = await fetchUpstream(region);
      _cache[region] = { data, ts: Date.now() };
      return jsonResponse(data, 200, { 'X-Cache': 'MISS' });
    } catch (err) {
      // Return stale cache if available rather than a hard error
      if (cached) {
        return jsonResponse(cached.data, 200, { 'X-Cache': 'STALE', 'X-Cache-Age': String(Date.now() - cached.ts) });
      }
      return jsonResponse(
        { error: 'Upstream unavailable', message: err.message },
        503
      );
    }
  },
};
