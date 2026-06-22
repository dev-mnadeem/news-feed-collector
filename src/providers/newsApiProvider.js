import { createArticle } from '../domain/article.js';
import { getJson } from '../services/http.js';
import { UPSTREAM_PAGE_SIZE, cleanByline, queryTerm } from './queryTerm.js';

const LABEL = 'News API';

/** @type {import('./types.js').NewsProvider} */
export const newsApiProvider = {
  id: 'newsapi',
  label: LABEL,
  requiresKey: true,
  supports: { keywords: true, dateRange: true, categories: true, authors: false },
  isConfigured: (config) => config.enabledSources.includes('newsapi'),

  async fetchArticles({ filters, config, signal, fetchImpl }) {
    const payload = await getJson(config.newsapi.baseUrl, {
      params: {
        q: queryTerm(filters),
        from: filters.from,
        to: filters.to,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: UPSTREAM_PAGE_SIZE,
      },
      signal,
      fetchImpl,
      timeoutMs: config.requestTimeoutMs,
    });

    return (payload.articles ?? []).map((item) =>
      createArticle({
        sourceId: 'newsapi',
        sourceLabel: LABEL,
        title: item.title,
        description: item.description,
        url: item.url,
        imageUrl: item.urlToImage,
        publishedAt: item.publishedAt,
        author: cleanByline(item.author),
        category: item.source?.name ?? '',
      })
    );
  },
};
