import { createArticle } from '../domain/article.js';
import fixtures from './fixtures/articles.json';

const LABELS = {
  newsapi: 'News API',
  guardian: 'The Guardian',
  nyt: 'The New York Times',
};

/**
 * A provider backed by a checked-in JSON file.
 *
 * It exists for three reasons, in order of importance:
 *  1. the app renders a full feed with no API keys, so `npm run dev` works on a
 *     fresh clone and the screenshot in the README is reproducible;
 *  2. tests get a fixed corpus instead of the live news cycle;
 *  3. the upstream APIs are rate-limited, and burning quota on a dev reload is
 *     the reason the original build kept returning an empty page.
 *
 * @type {import('./types.js').NewsProvider}
 */
export const fixtureProvider = {
  id: 'fixture',
  label: 'Local fixture',
  requiresKey: false,
  supports: { keywords: false, dateRange: false, categories: false, authors: false },
  isConfigured: () => true,
  async fetchArticles() {
    return fixtures.map((raw) =>
      createArticle({ ...raw, sourceLabel: LABELS[raw.sourceId] ?? raw.sourceId })
    );
  },
};

export const fixtureCount = fixtures.length;
