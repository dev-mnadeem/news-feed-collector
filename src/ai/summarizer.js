/**
 * The digest feature, behind a provider interface.
 *
 * A news aggregator's genuine AI shape is "tell me what these forty headlines
 * are about" — so that is the one feature here, and nothing else.
 *
 * @typedef {object} DigestBullet
 * @property {string} term
 * @property {number} count
 * @property {string} headline
 * @property {string} sourceLabel
 *
 * @typedef {object} Digest
 * @property {string} provider
 * @property {number} articleCount
 * @property {DigestBullet[]} bullets
 *
 * @typedef {object} Summarizer
 * @property {string} id
 * @property {string} label
 * @property {boolean} requiresKey
 * @property {(article: import('../domain/article.js').Article) => Promise<string>} summarizeArticle
 * @property {(articles: import('../domain/article.js').Article[]) => Promise<Digest>} summarizeFeed
 */

import { config as defaultConfig } from '../config/env.js';
import { getJson } from '../services/http.js';
import { localSummarizer } from './localSummarizer.js';

/** Articles sent to the remote endpoint per digest. Keeps the payload bounded. */
const REMOTE_DIGEST_LIMIT = 40;

/**
 * Optional remote summariser.
 *
 * It posts to an endpoint *you* run (`VITE_SUMMARY_API_URL`), not straight to a
 * model vendor: a Vite build is a browser bundle, and any key put in it ships to
 * every visitor. Your endpoint holds the key and calls the model.
 *
 * Anything that goes wrong — no URL, non-2xx, malformed body — falls back to
 * {@link localSummarizer}, so the digest panel always renders something.
 *
 * @type {Summarizer}
 */
export const remoteSummarizer = {
  id: 'remote',
  label: 'Remote digest service',
  requiresKey: true,
  summarizeArticle: localSummarizer.summarizeArticle,
  async summarizeFeed(articles, { config = defaultConfig, fetchImpl } = {}) {
    if (!config.summarizer.url) return localSummarizer.summarizeFeed(articles);
    try {
      const payload = await getJson(config.summarizer.url, {
        params: {
          model: config.summarizer.model,
          ids: articles
            .slice(0, REMOTE_DIGEST_LIMIT)
            .map((a) => a.id)
            .join(','),
        },
        timeoutMs: config.requestTimeoutMs,
        fetchImpl,
      });
      if (!Array.isArray(payload?.bullets)) throw new TypeError('Digest response has no bullets');
      return { provider: 'remote', articleCount: articles.length, bullets: payload.bullets };
    } catch {
      return localSummarizer.summarizeFeed(articles);
    }
  },
};

export const ALL_SUMMARIZERS = [localSummarizer, remoteSummarizer];

/** Pick the summariser this build should use. Unknown ids fall back to local. */
export function selectSummarizer(config = defaultConfig) {
  if (config.summarizer.provider === 'remote' && config.summarizer.url) return remoteSummarizer;
  return localSummarizer;
}
