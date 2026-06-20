/**
 * The default summariser: extractive, deterministic, and offline.
 *
 * Two jobs:
 *  - `summarizeText` picks the single most representative sentence of an
 *    article, scored by how often its own content words recur in that article;
 *  - `summarizeFeed` builds the digest — the sections the feed is weighted
 *    towards, each fronted by its most representative story.
 *
 * No model, no key, no network, which means the digest renders on a fresh clone
 * and the tests can assert exact output.
 */

import { splitSentences, tokenize } from './tokens.js';

/** Sentences longer than this are cut at a word boundary before display. */
const MAX_SUMMARY_CHARS = 180;

/** How many sections the feed digest shows. */
export const TOPIC_COUNT = 4;

function termFrequencies(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function truncate(sentence) {
  if (sentence.length <= MAX_SUMMARY_CHARS) return sentence;
  const cut = sentence.slice(0, MAX_SUMMARY_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Pick the single most representative sentence of a piece of text. */
export function summarizeText(text) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return '';
  if (sentences.length === 1) return truncate(sentences[0]);

  const frequencies = termFrequencies(tokenize(text));
  let best = sentences[0];
  let bestScore = -1;

  for (const sentence of sentences) {
    const tokens = tokenize(sentence);
    if (tokens.length === 0) continue;
    const score =
      tokens.reduce((sum, token) => sum + (frequencies.get(token) ?? 0), 0) /
      Math.sqrt(tokens.length);
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }
  return truncate(best);
}

const articleText = (article) => `${article.title} ${article.description}`;

/**
 * Group the feed by the section each provider assigned the story.
 *
 * Section is used rather than mined keywords on purpose: over a few dozen short
 * abstracts, raw term frequency surfaces newsroom filler ("report", "published")
 * rather than subjects, whereas the section is a label a human editor already
 * chose. Articles with no section fall back to their source.
 *
 * @returns {Map<string, import('../domain/article.js').Article[]>}
 */
export function groupBySection(articles) {
  const groups = new Map();
  for (const article of articles) {
    const key = article.category || article.sourceLabel;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(article);
  }
  return groups;
}

/**
 * The article that best represents a group: the one whose content words recur
 * most across the group's other articles. For a single-article group that is
 * trivially the article itself.
 */
export function representativeArticle(articles) {
  if (articles.length === 0) return null;
  if (articles.length === 1) return articles[0];

  const groupFrequencies = termFrequencies(articles.flatMap((a) => tokenize(articleText(a))));
  let best = articles[0];
  let bestScore = -1;

  for (const article of articles) {
    const tokens = tokenize(articleText(article));
    if (tokens.length === 0) continue;
    const score =
      tokens.reduce((sum, token) => sum + (groupFrequencies.get(token) ?? 0), 0) / tokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = article;
    }
  }
  return best;
}

/**
 * A digest of the visible feed: the heaviest sections, each fronted by its most
 * representative story. Groups are disjoint, so no headline appears twice.
 *
 * @type {import('./summarizer.js').Summarizer}
 */
export const localSummarizer = {
  id: 'local',
  label: 'Local extractive',
  requiresKey: false,
  async summarizeArticle(article) {
    return summarizeText(article.description || article.title);
  },
  async summarizeFeed(articles) {
    const bullets = [...groupBySection(articles).entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .slice(0, TOPIC_COUNT)
      .map(([section, group]) => {
        const lead = representativeArticle(group);
        return {
          term: section,
          count: group.length,
          headline: lead.title,
          sourceLabel: lead.sourceLabel,
        };
      });
    return { provider: 'local', articleCount: articles.length, bullets };
  },
};
