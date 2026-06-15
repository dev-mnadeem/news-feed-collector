/**
 * The only place in the app that calls `fetch`.
 *
 * Every provider goes through `getJson`, so timeouts, query-string building and
 * error shape are decided once instead of three times.
 */

import { DEFAULT_REQUEST_TIMEOUT_MS } from '../config/env.js';

/** Thrown for any non-2xx response or transport failure. Carries enough to render. */
export class HttpError extends Error {
  constructor(message, { status = 0, url = '', cause } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.cause = cause;
  }
}

/** Drops empty values so we never send `?q=&from=`. */
export function buildUrl(baseUrl, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  if (!query) return baseUrl;
  return baseUrl.includes('?') ? `${baseUrl}&${query}` : `${baseUrl}?${query}`;
}

/**
 * Fetch JSON with an abort-based timeout. `getJson` and `postJson` are the two
 * shapes the app needs; both share the timeout and error handling here.
 */
async function requestJson(url, init, options) {
  const { signal, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, fetchImpl = globalThis.fetch } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...init.headers },
    });
    if (!response.ok) {
      throw new HttpError(`Request failed with status ${response.status}`, {
        status: response.status,
        url,
      });
    }
    return await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.name === 'AbortError' && !signal?.aborted) {
      throw new HttpError(`Request timed out after ${timeoutMs}ms`, { url, cause: error });
    }
    throw new HttpError(error?.message || 'Network request failed', { url, cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * GET JSON.
 *
 * @param {string} baseUrl
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.params]
 * @param {AbortSignal} [options.signal]      caller-owned cancellation
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl]  injected in tests
 */
export function getJson(baseUrl, options = {}) {
  return requestJson(buildUrl(baseUrl, options.params), { method: 'GET' }, options);
}

/**
 * POST a JSON body and read JSON back. Same options as {@link getJson}, minus `params`.
 *
 * @param {string} url
 * @param {unknown} body
 * @param {object} [options]
 */
export function postJson(url, body, options = {}) {
  return requestJson(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    options
  );
}
