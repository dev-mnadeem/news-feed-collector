/**
 * The seam every news source plugs into.
 *
 * Adding a fourth source means writing one module that satisfies this shape and
 * adding it to the array in `registry.js`. Nothing else changes: the UI, the
 * filter pass and the summariser all work on {@link Article}, never on a
 * provider's wire format.
 *
 * @typedef {import('../domain/article.js').Article} Article
 * @typedef {import('../domain/filters.js').Filters} Filters
 * @typedef {import('../config/env.js').AppConfig} AppConfig
 *
 * @typedef {object} ProviderCapabilities
 * @property {boolean} keywords    can the upstream API narrow by free text
 * @property {boolean} dateRange
 * @property {boolean} categories
 * @property {boolean} authors
 *
 * @typedef {object} FetchRequest
 * @property {Filters} filters
 * @property {AppConfig} config
 * @property {AbortSignal} [signal]
 * @property {typeof fetch} [fetchImpl]
 *
 * @typedef {object} NewsProvider
 * @property {string} id
 * @property {string} label
 * @property {boolean} requiresKey
 * @property {ProviderCapabilities} supports
 * @property {(config: AppConfig) => boolean} isConfigured
 * @property {(request: FetchRequest) => Promise<Article[]>} fetchArticles
 */

const REQUIRED_KEYS = ['id', 'label', 'supports', 'isConfigured', 'fetchArticles'];

/** Guard used by the registry so a malformed provider fails loudly at startup. */
export function assertProvider(provider) {
  for (const key of REQUIRED_KEYS) {
    if (provider?.[key] === undefined) {
      throw new TypeError(`Invalid news provider: missing "${key}"`);
    }
  }
  return provider;
}

export const NO_CAPABILITIES = {
  keywords: false,
  dateRange: false,
  categories: false,
  authors: false,
};
