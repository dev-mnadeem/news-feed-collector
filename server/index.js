import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fixed upstream destinations. The browser only ever names a source id; the
 * URL, the key's environment variable and the accepted query fields are
 * decided here, so a client cannot redirect the key elsewhere.
 */
const UPSTREAMS = {
  newsapi: {
    url: 'https://newsapi.org/v2/everything',
    keyEnv: 'NEWSAPI_KEY',
    keyParam: 'apiKey',
    params: ['q', 'from', 'to', 'language', 'sortBy', 'pageSize'],
  },
  guardian: {
    url: 'https://content.guardianapis.com/search',
    keyEnv: 'GUARDIAN_KEY',
    keyParam: 'api-key',
    params: ['q', 'from-date', 'to-date', 'show-fields', 'page-size', 'order-by'],
  },
  nyt: {
    url: 'https://api.nytimes.com/svc/search/v2/articlesearch.json',
    keyEnv: 'NYT_KEY',
    keyParam: 'api-key',
    params: ['q', 'begin_date', 'end_date', 'sort', 'fq'],
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const MAX_BYTES = 2_000_000;
const MAX_PARAM_LENGTH = 500;
const UPSTREAM_TIMEOUT_MS = 8000;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const MAX_CONCURRENT = 12;
const SOURCE_PREFIX = '/api/news/';

/**
 * Vite fingerprints everything under /assets/, so those files can be cached
 * forever. index.html must never be cached, or a deploy leaves browsers
 * pointing at a bundle that no longer exists.
 */
function cacheControlFor(pathname, file) {
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (file.endsWith('index.html')) return 'no-store';
  return 'public, max-age=3600';
}

export function createApp({
  env = process.env,
  fetchImpl = globalThis.fetch,
  root = resolve('dist'),
} = {}) {
  let active = 0;
  let count = 0;
  let windowStart = Date.now();

  async function proxySource(url, request, response, reply) {
    const sourceId = url.pathname.slice(SOURCE_PREFIX.length);
    if (!url.pathname.startsWith(SOURCE_PREFIX) || !Object.hasOwn(UPSTREAMS, sourceId)) {
      return reply(404, { error: 'Unknown source' });
    }
    if (request.method !== 'GET') return reply(405, { error: 'GET required' });
    const upstream = UPSTREAMS[sourceId];
    if (!env[upstream.keyEnv]) return reply(503, { error: 'Source is not configured' });

    if (Date.now() - windowStart >= RATE_WINDOW_MS) {
      count = 0;
      windowStart = Date.now();
    }
    if (active >= MAX_CONCURRENT || count >= MAX_REQUESTS_PER_WINDOW) {
      return reply(429, { error: 'Source request limit reached' });
    }
    const invalid = [...url.searchParams].some(
      ([key, value]) => !upstream.params.includes(key) || value.length > MAX_PARAM_LENGTH
    );
    if (invalid) return reply(400, { error: 'Invalid source parameters' });

    const target = new URL(upstream.url);
    for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
    target.searchParams.set(upstream.keyParam, env[upstream.keyEnv]);

    // Client disconnects and the deadline both cancel the upstream request.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const disconnect = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on('close', disconnect);
    active += 1;
    count += 1;
    try {
      const answer = await fetchImpl(target, {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (!answer.ok) return reply(502, { error: 'Source request failed' });
      let length = 0;
      const chunks = [];
      for await (const chunk of answer.body) {
        length += chunk.length;
        if (length > MAX_BYTES) {
          controller.abort();
          return reply(502, { error: 'Source response exceeds limit' });
        }
        chunks.push(chunk);
      }
      return reply(200, JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      return reply(502, { error: 'Source is unavailable' });
    } finally {
      clearTimeout(timer);
      response.off('close', disconnect);
      active -= 1;
    }
  }

  async function serveStatic(url, request, response, reply) {
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const path = resolve(root, '.' + decodeURIComponent(requested));
    if (!path.startsWith(root + '/')) return reply(404, { error: 'Not found' });
    // Extensionless paths are client routes and get the app shell; a missing
    // asset stays a 404 so a stale bundle reference fails visibly.
    const isAsset = extname(path) !== '' || url.pathname.startsWith('/assets/');
    const file = isAsset ? path : resolve(root, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': cacheControlFor(url.pathname, file),
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  }

  return createServer(async (request, response) => {
    const reply = (status, body) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body));
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return reply(405, { error: 'GET required' });
    }
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/health') return reply(200, { status: 'ok' });
    if (url.pathname.startsWith('/api/')) return proxySource(url, request, response, reply);
    try {
      await serveStatic(url, request, response, reply);
    } catch {
      reply(404, { error: 'Not found' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(Number(process.env.PORT || 7150), process.env.HOST || '127.0.0.1');
}
