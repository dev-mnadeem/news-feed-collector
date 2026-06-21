import { describe, expect, it } from 'vitest';
import {
  createArticle,
  dedupeArticles,
  formatPublished,
  generatedCover,
  paginate,
  sortByPublishedDesc,
  stableHash,
} from '../src/domain/article.js';

const make = (overrides) =>
  createArticle({
    sourceId: 'guardian',
    sourceLabel: 'The Guardian',
    title: 'A title',
    description: 'A description.',
    url: 'https://example.com/a',
    publishedAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  });

describe('stableHash', () => {
  it('is deterministic for the same input', () => {
    expect(stableHash('news')).toBe(stableHash('news'));
  });

  it('separates different inputs', () => {
    expect(stableHash('news')).not.toBe(stableHash('newt'));
  });
});

describe('createArticle', () => {
  it('fills missing fields with empty strings rather than undefined', () => {
    const article = createArticle({ sourceId: 'nyt', title: 'T', url: 'https://x/1' });
    expect(article.description).toBe('');
    expect(article.author).toBe('');
    expect(article.category).toBe('');
    expect(article.imageUrl).toBeNull();
  });

  it('falls back to "Untitled" instead of rendering undefined', () => {
    expect(createArticle({ sourceId: 'nyt', url: 'https://x/2' }).title).toBe('Untitled');
  });

  it('normalises publishedAt to ISO-8601 and drops unparseable dates', () => {
    expect(make({ publishedAt: 'Sun, 20 Sep 2026 00:00:00 GMT' }).publishedAt).toBe(
      '2026-09-20T00:00:00.000Z'
    );
    expect(make({ publishedAt: 'not a date' }).publishedAt).toBe('');
  });

  it('gives the same id to the same source+url across calls', () => {
    expect(make({}).id).toBe(make({ title: 'Different headline' }).id);
  });

  it('gives different ids to the same url from different sources', () => {
    expect(make({}).id).not.toBe(make({ sourceId: 'nyt' }).id);
  });
});

describe('dedupeArticles', () => {
  it('keeps the first occurrence of each id', () => {
    const first = make({ title: 'First' });
    const second = make({ title: 'Second' });
    const result = dedupeArticles([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('First');
  });
});

describe('sortByPublishedDesc', () => {
  it('orders newest first and does not mutate the input', () => {
    const input = [
      make({ url: 'https://x/1', publishedAt: '2026-09-01T00:00:00.000Z' }),
      make({ url: 'https://x/2', publishedAt: '2026-09-05T00:00:00.000Z' }),
    ];
    const sorted = sortByPublishedDesc(input);
    expect(sorted.map((a) => a.url)).toEqual(['https://x/2', 'https://x/1']);
    expect(input[0].url).toBe('https://x/1');
  });

  it('pushes undated articles to the end', () => {
    const dated = make({ url: 'https://x/1' });
    const undated = make({ url: 'https://x/2', publishedAt: '' });
    expect(sortByPublishedDesc([undated, dated])[0].url).toBe('https://x/1');
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it('returns a growing window, not a single page', () => {
    expect(paginate(items, 1, 10)).toHaveLength(10);
    expect(paginate(items, 2, 10)).toHaveLength(20);
  });

  it('never overruns the list', () => {
    expect(paginate(items, 99, 10)).toHaveLength(25);
  });

  it('coerces nonsense page and size values to 1', () => {
    expect(paginate(items, 0, 0)).toHaveLength(1);
  });
});

describe('presentation helpers', () => {
  it('labels a missing date rather than printing Invalid Date', () => {
    expect(formatPublished(make({ publishedAt: '' }))).toBe('Undated');
  });

  it('generates a stable inline SVG cover with no network dependency', () => {
    const cover = generatedCover(make({}));
    expect(cover.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(cover).toBe(generatedCover(make({})));
  });

  it('keeps one source in a single colour family', () => {
    const hue = (article) =>
      Number(/hsl\((\d+)/.exec(decodeURIComponent(generatedCover(article)))[1]);
    const a = hue(make({ url: 'https://x/1' }));
    const b = hue(make({ url: 'https://x/2' }));
    const other = hue(make({ url: 'https://x/3', sourceId: 'nyt' }));
    expect(Math.abs(a - b)).toBeLessThan(24);
    expect(a).not.toBe(other);
  });
});
