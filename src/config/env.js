/**
 * Every environment-derived value the app reads lives here.
 *
 * Nothing else in `src/` touches `import.meta.env`, so a test can build a
 * different config object and hand it to the provider registry without
 * monkey-patching globals.
 */

/** Requests slower than this are aborted rather than left hanging. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

/** Articles rendered per page before "Load more". */
export const DEFAULT_PAGE_SIZE = 12;

/** Upper bound on articles kept in memory from a single refresh. */
export const MAX_ARTICLES_IN_MEMORY = 300;

const raw = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(trimmed(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const csv = (value) =>
  trimmed(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * @typedef {object} AppConfig
 * @property {{baseUrl: string}} newsapi
 * @property {{baseUrl: string}} guardian
 * @property {{baseUrl: string}} nyt
 * @property {string[]} enabledSources  explicit allow-list, empty means "auto-detect"
 * @property {number} pageSize
 * @property {number} requestTimeoutMs
 * @property {{provider: string, url: string, model: string}} summarizer
 */

/** @returns {AppConfig} */
export function readConfig(source = raw) {
  return {
    newsapi: { baseUrl: '/api/news/newsapi' },
    guardian: { baseUrl: '/api/news/guardian' },
    nyt: { baseUrl: '/api/news/nyt' },
    enabledSources: csv(source.VITE_NEWS_SOURCES),
    pageSize: positiveInt(source.VITE_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    requestTimeoutMs: positiveInt(source.VITE_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    // No API key here on purpose: this is a browser bundle, so the remote
    // summariser talks to an endpoint you host, which holds the model key.
    summarizer: {
      provider: trimmed(source.VITE_SUMMARY_PROVIDER) || 'local',
      url: trimmed(source.VITE_SUMMARY_API_URL),
      model: trimmed(source.VITE_SUMMARY_MODEL) || 'claude-opus-5',
    },
  };
}

export const config = readConfig();
