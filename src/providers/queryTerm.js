/** Shared upstream-query helpers. All three remote providers need a search term. */

/** NewsAPI and NYT both reject an empty query, so we always send something. */
export const DEFAULT_QUERY_TERM = 'news';

/** How many articles to ask each upstream API for in one request. */
export const UPSTREAM_PAGE_SIZE = 40;

/**
 * Build the free-text term from the user's filters.
 * Categories become an OR clause so a category-only filter still narrows upstream.
 */
export function queryTerm(filters) {
  const keywords = filters.keywords.trim();
  const categories = filters.categories.filter(Boolean);
  if (keywords && categories.length) return `${keywords} OR ${categories.join(' OR ')}`;
  if (keywords) return keywords;
  if (categories.length) return categories.join(' OR ');
  return DEFAULT_QUERY_TERM;
}

/** `2026-09-27` -> `20260927`, which is the only date format NYT accepts. */
export function compactDate(isoDate) {
  return isoDate ? isoDate.replaceAll('-', '') : '';
}

/** Guardian and NYT prefix bylines with "By ". The UI wants just the name. */
export function cleanByline(byline) {
  return typeof byline === 'string' ? byline.replace(/^by\s+/i, '').trim() : '';
}
