/**
 * The one Article shape the UI knows about.
 *
 * Every provider is responsible for mapping its own wire format into this
 * object, so nothing downstream of `src/providers/` ever sees `webPublicationDate`,
 * `urlToImage` or `headline.main`.
 *
 * @typedef {object} Article
 * @property {string} id            stable across refreshes, derived from source + url
 * @property {string} title
 * @property {string} description
 * @property {string} url
 * @property {string|null} imageUrl null means "render the generated cover"
 * @property {string} publishedAt   ISO-8601, or '' when the source omitted it
 * @property {string} sourceId      provider id, e.g. 'guardian'
 * @property {string} sourceLabel   human label, e.g. 'The Guardian'
 * @property {string} author
 * @property {string} category
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HUE_COUNT = 360;

/** FNV-1a. Small, dependency-free, and stable across runs — which is what ids need. */
export function stableHash(input) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(36);
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

const toIso = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

/**
 * Normalise a provider's raw mapping into an {@link Article}.
 * Missing fields become empty strings rather than `undefined`, so the UI never
 * has to guard with `?.` and never renders the string "undefined".
 */
export function createArticle(partial) {
  const url = text(partial.url);
  const sourceId = text(partial.sourceId) || 'unknown';
  const title = text(partial.title) || 'Untitled';
  return {
    id: stableHash(`${sourceId}|${url || title}`),
    title,
    description: text(partial.description),
    url,
    imageUrl: text(partial.imageUrl) || null,
    publishedAt: toIso(partial.publishedAt),
    sourceId,
    sourceLabel: text(partial.sourceLabel) || sourceId,
    author: text(partial.author),
    category: text(partial.category),
  };
}

/** Same story syndicated by two providers still counts twice; same id does not. */
export function dedupeArticles(articles) {
  const seen = new Set();
  const out = [];
  for (const article of articles) {
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    out.push(article);
  }
  return out;
}

/** Newest first. Returns a new array — callers hold React state. */
export function sortByPublishedDesc(articles) {
  return [...articles].sort((a, b) => {
    if (a.publishedAt === b.publishedAt) return a.title.localeCompare(b.title);
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return a.publishedAt < b.publishedAt ? 1 : -1;
  });
}

/** Slice the first `page` pages. The feed grows downward, it does not jump. */
export function paginate(articles, page, pageSize) {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.max(1, Math.floor(pageSize) || 1);
  return articles.slice(0, safePage * safeSize);
}

export function formatPublished(article, locale = 'en-GB') {
  if (!article.publishedAt) return 'Undated';
  return new Date(article.publishedAt).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Per-article hue drift within a source's colour family. */
const HUE_JITTER = 24;

/**
 * Hash values for short strings land close together on the colour wheel, which
 * gives every source the same purple. Stepping by the golden angle spreads them.
 */
const HUE_STEP = 137;

/**
 * A deterministic inline cover for articles whose source gave us no image.
 *
 * It is an SVG data URI rather than a remote placeholder service, so the grid
 * has no ragged holes, no third-party request, and renders identically offline.
 *
 * The base hue comes from the source, not the article, so every Guardian card
 * sits in one colour family and the grid reads as three mastheads rather than a
 * random swatch book.
 */
export function generatedCover(article) {
  const base = (Number.parseInt(stableHash(article.sourceId), 36) * HUE_STEP) % HUE_COUNT;
  const drift = Number.parseInt(stableHash(article.id), 36) % HUE_JITTER;
  const hue = (base + drift) % HUE_COUNT;
  const initials = article.sourceLabel
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${hue} 34% 42%)"/>
<stop offset="100%" stop-color="hsl(${(hue + 22) % HUE_COUNT} 30% 24%)"/>
</linearGradient></defs>
<rect width="640" height="360" fill="url(#g)"/>
<text x="320" y="200" font-family="Georgia, serif" font-size="96" font-weight="700"
 fill="rgba(255,255,255,0.86)" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
