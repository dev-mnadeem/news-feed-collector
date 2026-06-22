import { createArticle } from '../domain/article.js';
import { getJson } from '../services/http.js';
import { cleanByline, compactDate, queryTerm } from './queryTerm.js';

const LABEL = 'The New York Times';
const NYT_ASSET_ROOT = 'https://www.nytimes.com/';

/**
 * NYT has shipped two shapes for `multimedia`: a legacy array of objects with
 * relative `url`s, and a keyed object with absolute ones. Handle both rather
 * than gambling on which account the reviewer's key is on.
 */
function nytImageUrl(multimedia) {
  const candidate = Array.isArray(multimedia) ? multimedia[0]?.url : multimedia?.default?.url;
  if (!candidate) return '';
  return candidate.startsWith('http') ? candidate : `${NYT_ASSET_ROOT}${candidate}`;
}

/** @type {import('./types.js').NewsProvider} */
export const nytProvider = {
  id: 'nyt',
  label: LABEL,
  requiresKey: true,
  supports: { keywords: true, dateRange: true, categories: true, authors: true },
  isConfigured: (config) => config.enabledSources.includes('nyt'),

  async fetchArticles({ filters, config, signal, fetchImpl }) {
    const authorClause = filters.authors.length
      ? `byline:("${filters.authors.join('" "')}")`
      : undefined;

    const payload = await getJson(config.nyt.baseUrl, {
      params: {
        q: queryTerm(filters),
        begin_date: compactDate(filters.from),
        end_date: compactDate(filters.to),
        sort: 'newest',
        fq: authorClause,
      },
      signal,
      fetchImpl,
      timeoutMs: config.requestTimeoutMs,
    });

    return (payload.response?.docs ?? []).map((doc) =>
      createArticle({
        sourceId: 'nyt',
        sourceLabel: LABEL,
        title: doc.headline?.main,
        description: doc.abstract || doc.lead_paragraph,
        url: doc.web_url,
        imageUrl: nytImageUrl(doc.multimedia),
        publishedAt: doc.pub_date,
        author: cleanByline(doc.byline?.original),
        category: doc.section_name ?? '',
      })
    );
  },
};
