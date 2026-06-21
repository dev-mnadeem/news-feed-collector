import { describe, expect, it } from 'vitest';
import { createArticle } from '../src/domain/article.js';
import {
  activeFilterCount,
  applyFilters,
  emptyFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
  matchesFilters,
} from '../src/domain/filters.js';

const article = createArticle({
  sourceId: 'guardian',
  sourceLabel: 'The Guardian',
  title: 'Rewilded floodplain absorbs a record surge',
  description: 'A river restored in 2019 held back four million cubic metres.',
  url: 'https://example.com/a',
  publishedAt: '2026-09-20T10:00:00.000Z',
  author: 'Eleanor Rhys',
  category: 'Environment',
});

const withFilters = (overrides) => ({ ...emptyFilters(), ...overrides });

describe('matchesFilters', () => {
  it('passes everything when no filter is set', () => {
    expect(matchesFilters(article, emptyFilters())).toBe(true);
  });

  it('matches keywords across title, description and byline', () => {
    expect(matchesFilters(article, withFilters({ keywords: 'floodplain' }))).toBe(true);
    expect(matchesFilters(article, withFilters({ keywords: 'cubic metres' }))).toBe(true);
    expect(matchesFilters(article, withFilters({ keywords: 'Eleanor' }))).toBe(true);
    expect(matchesFilters(article, withFilters({ keywords: 'quantum' }))).toBe(false);
  });

  it('is case-insensitive on list filters', () => {
    expect(matchesFilters(article, withFilters({ categories: ['environment'] }))).toBe(true);
    expect(matchesFilters(article, withFilters({ sources: ['GUARDIAN'] }))).toBe(true);
  });

  it('treats the "to" bound as inclusive of the whole day', () => {
    expect(matchesFilters(article, withFilters({ to: '2026-09-20' }))).toBe(true);
    expect(matchesFilters(article, withFilters({ to: '2026-09-19' }))).toBe(false);
  });

  it('applies the "from" bound inclusively', () => {
    expect(matchesFilters(article, withFilters({ from: '2026-09-20' }))).toBe(true);
    expect(matchesFilters(article, withFilters({ from: '2026-09-21' }))).toBe(false);
  });

  it('excludes undated articles once a date bound exists', () => {
    const undated = createArticle({ ...article, publishedAt: '', url: 'https://example.com/b' });
    expect(matchesFilters(undated, withFilters({ from: '2026-01-01' }))).toBe(false);
    expect(matchesFilters(undated, emptyFilters())).toBe(true);
  });
});

describe('applyFilters', () => {
  it('combines predicates with AND', () => {
    const filters = withFilters({ keywords: 'floodplain', categories: ['Politics'] });
    expect(applyFilters([article], filters)).toHaveLength(0);
  });
});

describe('activeFilterCount', () => {
  it('counts each selected value, not each populated field', () => {
    const filters = withFilters({ keywords: 'x', sources: ['a', 'b'], from: '2026-01-01' });
    expect(activeFilterCount(filters)).toBe(4);
  });

  it('ignores whitespace-only keywords', () => {
    expect(activeFilterCount(withFilters({ keywords: '   ' }))).toBe(0);
  });
});

describe('URL round-trip', () => {
  it('survives a serialise/parse cycle unchanged', () => {
    const filters = withFilters({
      keywords: 'rail link',
      sources: ['guardian', 'nyt'],
      categories: ['Tech'],
      authors: ['Aisha Bello'],
      from: '2026-09-01',
      to: '2026-09-30',
    });
    const parsed = filtersFromSearchParams(filtersToSearchParams(filters).toString());
    expect(parsed).toEqual(filters);
  });

  it('omits empty values from the query string', () => {
    expect(filtersToSearchParams(emptyFilters()).toString()).toBe('');
  });

  it('ignores unknown query parameters', () => {
    expect(filtersFromSearchParams('?utm_source=mail')).toEqual(emptyFilters());
  });
});
