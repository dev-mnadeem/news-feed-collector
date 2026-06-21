/**
 * Fan out to every active provider, fold the results into one feed.
 *
 * One provider failing must not empty the page, so this uses `allSettled` and
 * returns the failures alongside the articles instead of throwing. The UI shows
 * a banner naming the source that failed and still renders the rest.
 */

import { MAX_ARTICLES_IN_MEMORY, config as defaultConfig } from '../config/env.js';
import { dedupeArticles, sortByPublishedDesc } from '../domain/article.js';
import { applyFilters, filtersToSearchParams } from '../domain/filters.js';
import { resolveProviders } from '../providers/registry.js';

/** How long a fetched feed stays reusable. Upstream keys are rate-limited per day. */
export const CACHE_TTL_MS = 60_000;

const cache = new Map();

/** Cache key: the provider set plus the exact filters that produced the request. */
export function feedCacheKey(providers, filters) {
  return `${providers.map((p) => p.id).join('+')}?${filtersToSearchParams(filters).toString()}`;
}

export function clearFeedCache() {
  cache.clear();
}

/**
 * @typedef {object} FeedResult
 * @property {import('../domain/article.js').Article[]} articles   matching the filters
 * @property {import('../domain/article.js').Article[]} facetArticles  everything fetched
 * @property {{sourceId: string, sourceLabel: string, message: string}[]} errors
 * @property {string[]} usedProviders
 * @property {boolean} fromCache
 */

/** @returns {Promise<FeedResult>} */
export async function loadFeed({
  filters,
  config = defaultConfig,
  signal,
  fetchImpl,
  now = Date.now,
} = {}) {
  const providers = resolveProviders(config);
  const key = feedCacheKey(providers, filters);
  const cached = cache.get(key);
  if (cached && now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.value, fromCache: true };
  }

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.fetchArticles({ filters, config, signal, fetchImpl }))
  );

  const collected = [];
  const errors = [];
  settled.forEach((outcome, index) => {
    const provider = providers[index];
    if (outcome.status === 'fulfilled') {
      collected.push(...outcome.value);
    } else {
      errors.push({
        sourceId: provider.id,
        sourceLabel: provider.label,
        message: outcome.reason?.message ?? 'Unknown error',
      });
    }
  });

  const fetched = sortByPublishedDesc(dedupeArticles(collected)).slice(0, MAX_ARTICLES_IN_MEMORY);

  // Second pass: providers narrow by what their own API supports, so this is
  // what makes the result consistent across sources with different capabilities.
  //
  // `facetArticles` is deliberately the *unfiltered* set. Deriving the filter
  // options from the filtered result would delete every option you have not
  // picked — select one source and the other two vanish, with no way back.
  const articles = applyFilters(fetched, filters);

  const value = {
    articles,
    facetArticles: fetched,
    errors,
    usedProviders: providers.map((p) => p.id),
  };
  cache.set(key, { at: now(), value });
  return { ...value, fromCache: false };
}
