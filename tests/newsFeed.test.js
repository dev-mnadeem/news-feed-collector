import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/config/env.js';
import { emptyFilters } from '../src/domain/filters.js';
import { fixtureCount } from '../src/providers/fixtureProvider.js';
import { CACHE_TTL_MS, clearFeedCache, feedCacheKey, loadFeed } from '../src/services/newsFeed.js';

const fixtureConfig = readConfig({ VITE_NEWS_SOURCES: 'fixture' });

beforeEach(() => clearFeedCache());

describe('loadFeed', () => {
  it('returns the whole fixture corpus, newest first', async () => {
    const result = await loadFeed({ filters: emptyFilters(), config: fixtureConfig });
    expect(result.articles).toHaveLength(fixtureCount);
    const dates = result.articles.map((a) => a.publishedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('reports which providers produced the feed', async () => {
    const result = await loadFeed({ filters: emptyFilters(), config: fixtureConfig });
    expect(result.usedProviders).toEqual(['fixture']);
    expect(result.errors).toEqual([]);
  });

  it('applies filters after normalising, so every source obeys them', async () => {
    const result = await loadFeed({
      filters: { ...emptyFilters(), sources: ['guardian'] },
      config: fixtureConfig,
    });
    expect(result.articles.length).toBeGreaterThan(0);
    expect(result.articles.every((a) => a.sourceId === 'guardian')).toBe(true);
  });

  it('keeps the unfiltered set for the facet lists so options never vanish', async () => {
    const result = await loadFeed({
      filters: { ...emptyFilters(), sources: ['guardian'] },
      config: fixtureConfig,
    });
    expect(result.facetArticles).toHaveLength(fixtureCount);
    expect(new Set(result.facetArticles.map((a) => a.sourceId)).size).toBe(3);
  });

  it('returns an empty list rather than throwing when filters exclude everything', async () => {
    const result = await loadFeed({
      filters: { ...emptyFilters(), keywords: 'zzzznothing' },
      config: fixtureConfig,
    });
    expect(result.articles).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

describe('partial failure', () => {
  const failing = {
    id: 'flaky',
    label: 'Flaky Source',
    requiresKey: true,
    supports: {},
    isConfigured: () => true,
    fetchArticles: async () => {
      throw new Error('Request failed with status 429');
    },
  };

  it('keeps the healthy sources and names the failed one', async () => {
    vi.resetModules();
    vi.doMock('../src/providers/registry.js', async (importOriginal) => {
      const actual = await importOriginal();
      const { fixtureProvider } = await import('../src/providers/fixtureProvider.js');
      return { ...actual, resolveProviders: () => [fixtureProvider, failing] };
    });
    const { loadFeed: mockedLoad } = await import('../src/services/newsFeed.js');

    const result = await mockedLoad({ filters: emptyFilters(), config: fixtureConfig });
    expect(result.articles).toHaveLength(fixtureCount);
    expect(result.errors).toEqual([
      { sourceId: 'flaky', sourceLabel: 'Flaky Source', message: 'Request failed with status 429' },
    ]);
    vi.doUnmock('../src/providers/registry.js');
    vi.resetModules();
  });
});

describe('cache', () => {
  it('keys on the provider set and the exact filters', () => {
    const providers = [{ id: 'fixture' }];
    expect(feedCacheKey(providers, { ...emptyFilters(), keywords: 'rail' })).toBe('fixture?q=rail');
    expect(feedCacheKey(providers, emptyFilters())).toBe('fixture?');
  });

  it('serves a repeat request from cache', async () => {
    const first = await loadFeed({ filters: emptyFilters(), config: fixtureConfig });
    const second = await loadFeed({ filters: emptyFilters(), config: fixtureConfig });
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
  });

  it('expires entries after the TTL', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    await loadFeed({ filters: emptyFilters(), config: fixtureConfig, now });
    clock += CACHE_TTL_MS + 1;
    const refreshed = await loadFeed({ filters: emptyFilters(), config: fixtureConfig, now });
    expect(refreshed.fromCache).toBe(false);
  });

  it('does not serve one filter set from another filter set entry', async () => {
    await loadFeed({ filters: emptyFilters(), config: fixtureConfig });
    const narrowed = await loadFeed({
      filters: { ...emptyFilters(), sources: ['nyt'] },
      config: fixtureConfig,
    });
    expect(narrowed.fromCache).toBe(false);
  });
});
