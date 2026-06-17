/**
 * Filter state, and the two things we do with it: narrow a list of articles,
 * and put it in the address bar so a filtered feed is a shareable link.
 *
 * @typedef {object} Filters
 * @property {string} keywords
 * @property {string[]} sources    provider ids
 * @property {string[]} categories
 * @property {string[]} authors
 * @property {string} from  ISO date (yyyy-mm-dd), inclusive
 * @property {string} to    ISO date (yyyy-mm-dd), inclusive
 */

const LIST_KEYS = ['sources', 'categories', 'authors'];
const END_OF_DAY = 'T23:59:59.999Z';

/** @returns {Filters} */
export function emptyFilters() {
  return { keywords: '', sources: [], categories: [], authors: [], from: '', to: '' };
}

export function activeFilterCount(filters) {
  let count = 0;
  if (filters.keywords.trim()) count += 1;
  for (const key of LIST_KEYS) count += filters[key].length;
  if (filters.from) count += 1;
  if (filters.to) count += 1;
  return count;
}

const containsKeywords = (article, keywords) => {
  const needle = keywords.trim().toLowerCase();
  if (!needle) return true;
  return `${article.title} ${article.description} ${article.author}`.toLowerCase().includes(needle);
};

const inList = (value, list) =>
  list.length === 0 || list.some((entry) => entry.toLowerCase() === value.toLowerCase());

const inRange = (article, from, to) => {
  if (!article.publishedAt) return !from && !to;
  if (from && article.publishedAt < new Date(from).toISOString()) return false;
  if (to && article.publishedAt > `${to}${END_OF_DAY}`) return false;
  return true;
};

/**
 * Providers each apply what they can server-side, but none of them support the
 * full filter set. This is the second pass that makes the result consistent
 * regardless of which provider a given article came from.
 */
export function matchesFilters(article, filters) {
  return (
    containsKeywords(article, filters.keywords) &&
    inList(article.sourceId, filters.sources) &&
    inList(article.category, filters.categories) &&
    inList(article.author, filters.authors) &&
    inRange(article, filters.from, filters.to)
  );
}

export function applyFilters(articles, filters) {
  return articles.filter((article) => matchesFilters(article, filters));
}

/** Filters -> `?q=...&sources=a,b` so the feed can be linked to. */
export function filtersToSearchParams(filters) {
  const params = new URLSearchParams();
  if (filters.keywords.trim()) params.set('q', filters.keywords.trim());
  for (const key of LIST_KEYS) {
    if (filters[key].length) params.set(key, filters[key].join(','));
  }
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return params;
}

/** The inverse. Unknown params are ignored rather than throwing. */
export function filtersFromSearchParams(search) {
  const params = new URLSearchParams(search);
  const filters = emptyFilters();
  filters.keywords = params.get('q') ?? '';
  for (const key of LIST_KEYS) {
    const value = params.get(key);
    filters[key] = value ? value.split(',').filter(Boolean) : [];
  }
  filters.from = params.get('from') ?? '';
  filters.to = params.get('to') ?? '';
  return filters;
}
