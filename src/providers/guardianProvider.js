import { createArticle } from '../domain/article.js';
import { getJson } from '../services/http.js';
import { UPSTREAM_PAGE_SIZE, cleanByline, queryTerm } from './queryTerm.js';

const LABEL = 'The Guardian';

/** @type {import('./types.js').NewsProvider} */
export const guardianProvider = {
  id: 'guardian',
  label: LABEL,
  requiresKey: true,
  supports: { keywords: true, dateRange: true, categories: true, authors: false },
  isConfigured: (config) => Boolean(config.guardian.key),

  async fetchArticles({ filters, config, signal, fetchImpl }) {
    const payload = await getJson(config.guardian.baseUrl, {
      params: {
        q: queryTerm(filters),
        'from-date': filters.from,
        'to-date': filters.to,
        'show-fields': 'trailText,thumbnail,byline',
        'page-size': UPSTREAM_PAGE_SIZE,
        'order-by': 'newest',
        'api-key': config.guardian.key,
      },
      signal,
      fetchImpl,
      timeoutMs: config.requestTimeoutMs,
    });

    return (payload.response?.results ?? []).map((item) =>
      createArticle({
        sourceId: 'guardian',
        sourceLabel: LABEL,
        title: item.webTitle,
        description: item.fields?.trailText,
        url: item.webUrl,
        imageUrl: item.fields?.thumbnail,
        publishedAt: item.webPublicationDate,
        author: cleanByline(item.fields?.byline),
        category: item.sectionName ?? '',
      })
    );
  },
};
