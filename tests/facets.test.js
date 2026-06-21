import { describe, expect, it } from 'vitest';
import { createArticle } from '../src/domain/article.js';
import { collectFacets } from '../src/domain/facets.js';

const corpus = [
  createArticle({
    sourceId: 'guardian',
    sourceLabel: 'The Guardian',
    url: 'https://x/1',
    category: 'Environment',
    author: 'Eleanor Rhys',
  }),
  createArticle({
    sourceId: 'guardian',
    sourceLabel: 'The Guardian',
    url: 'https://x/2',
    category: 'Science',
    author: 'Eleanor Rhys',
  }),
  createArticle({
    sourceId: 'nyt',
    sourceLabel: 'The New York Times',
    url: 'https://x/3',
    category: 'Science',
    author: '',
  }),
];

describe('collectFacets', () => {
  it('derives source options with their human labels', () => {
    const { sources } = collectFacets(corpus);
    expect(sources).toEqual([
      { value: 'guardian', label: 'The Guardian', count: 2 },
      { value: 'nyt', label: 'The New York Times', count: 1 },
    ]);
  });

  it('orders categories by count then alphabetically', () => {
    expect(collectFacets(corpus).categories).toEqual([
      { value: 'Science', count: 2 },
      { value: 'Environment', count: 1 },
    ]);
  });

  it('omits articles with no byline from the author facet', () => {
    expect(collectFacets(corpus).authors).toEqual([{ value: 'Eleanor Rhys', count: 2 }]);
  });

  it('returns empty facets for an empty corpus', () => {
    expect(collectFacets([])).toEqual({ sources: [], categories: [], authors: [] });
  });
});
