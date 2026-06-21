import { describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/config/env.js';
import { emptyFilters } from '../src/domain/filters.js';
import { fixtureProvider, fixtureCount } from '../src/providers/fixtureProvider.js';
import { guardianProvider } from '../src/providers/guardianProvider.js';
import { newsApiProvider } from '../src/providers/newsApiProvider.js';
import { nytProvider } from '../src/providers/nytProvider.js';
import { cleanByline, compactDate, queryTerm } from '../src/providers/queryTerm.js';
import { assertProvider } from '../src/providers/types.js';
import { ALL_PROVIDERS, isFixtureMode, resolveProviders } from '../src/providers/registry.js';

const jsonFetch = (body) => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, calls };
};

const baseConfig = readConfig({
  VITE_NEWSAPI_KEY: 'na-key',
  VITE_GUARDIAN_KEY: 'gu-key',
  VITE_NYT_KEY: 'ny-key',
});

describe('query helpers', () => {
  it('falls back to a default term so the upstream APIs do not reject the call', () => {
    expect(queryTerm(emptyFilters())).toBe('news');
  });

  it('ORs categories into the term', () => {
    expect(queryTerm({ ...emptyFilters(), categories: ['Tech', 'Science'] })).toBe(
      'Tech OR Science'
    );
  });

  it('combines keywords with categories', () => {
    expect(queryTerm({ ...emptyFilters(), keywords: 'rail', categories: ['Tech'] })).toBe(
      'rail OR Tech'
    );
  });

  it('compacts dates for NYT and leaves an empty date empty', () => {
    expect(compactDate('2026-09-27')).toBe('20260927');
    expect(compactDate('')).toBe('');
  });

  it('strips the "By " prefix from bylines', () => {
    expect(cleanByline('By Eleanor Rhys')).toBe('Eleanor Rhys');
    expect(cleanByline(undefined)).toBe('');
  });
});

describe('every provider satisfies the interface', () => {
  it.each(ALL_PROVIDERS.map((p) => [p.id, p]))('%s', (_id, provider) => {
    expect(() => assertProvider(provider)).not.toThrow();
  });

  it('rejects a malformed provider', () => {
    expect(() => assertProvider({ id: 'broken' })).toThrow(TypeError);
  });
});

describe('newsApiProvider', () => {
  it('maps the NewsAPI wire format onto Article', async () => {
    const { fetchImpl } = jsonFetch({
      articles: [
        {
          title: 'Headline',
          description: 'Body text.',
          url: 'https://news/1',
          urlToImage: 'https://news/1.jpg',
          publishedAt: '2026-09-27T08:15:00Z',
          author: 'By Priya Raghavan',
          source: { name: 'Wire' },
        },
      ],
    });
    const [article] = await newsApiProvider.fetchArticles({
      filters: emptyFilters(),
      config: baseConfig,
      fetchImpl,
    });
    expect(article.sourceLabel).toBe('News API');
    expect(article.author).toBe('Priya Raghavan');
    expect(article.imageUrl).toBe('https://news/1.jpg');
    expect(article.publishedAt).toBe('2026-09-27T08:15:00.000Z');
  });

  it('sends the key and the date bounds as query params', async () => {
    const { fetchImpl, calls } = jsonFetch({ articles: [] });
    await newsApiProvider.fetchArticles({
      filters: { ...emptyFilters(), from: '2026-09-01', to: '2026-09-30' },
      config: baseConfig,
      fetchImpl,
    });
    expect(calls[0]).toContain('apiKey=na-key');
    expect(calls[0]).toContain('from=2026-09-01');
    expect(calls[0]).toContain('to=2026-09-30');
  });

  it('survives a response with no articles array', async () => {
    const { fetchImpl } = jsonFetch({});
    await expect(
      newsApiProvider.fetchArticles({ filters: emptyFilters(), config: baseConfig, fetchImpl })
    ).resolves.toEqual([]);
  });
});

describe('guardianProvider', () => {
  it('maps the Guardian wire format onto Article', async () => {
    const { fetchImpl } = jsonFetch({
      response: {
        results: [
          {
            webTitle: 'Rewilded floodplain',
            webUrl: 'https://guardian/1',
            webPublicationDate: '2026-09-27T10:00:00Z',
            sectionName: 'Environment',
            fields: { trailText: 'Trail.', thumbnail: 'https://g/1.jpg', byline: 'Eleanor Rhys' },
          },
        ],
      },
    });
    const [article] = await guardianProvider.fetchArticles({
      filters: emptyFilters(),
      config: baseConfig,
      fetchImpl,
    });
    expect(article.category).toBe('Environment');
    expect(article.description).toBe('Trail.');
    expect(article.sourceId).toBe('guardian');
  });
});

describe('nytProvider', () => {
  it('handles the legacy multimedia array with relative urls', async () => {
    const { fetchImpl } = jsonFetch({
      response: {
        docs: [
          {
            headline: { main: 'Outage reporting' },
            abstract: 'Abstract.',
            web_url: 'https://nyt/1',
            pub_date: '2026-09-27T12:30:00Z',
            section_name: 'U.S.',
            byline: { original: 'By Caroline Whitaker' },
            multimedia: [{ url: 'images/a.jpg' }],
          },
        ],
      },
    });
    const [article] = await nytProvider.fetchArticles({
      filters: emptyFilters(),
      config: baseConfig,
      fetchImpl,
    });
    expect(article.imageUrl).toBe('https://www.nytimes.com/images/a.jpg');
    expect(article.author).toBe('Caroline Whitaker');
  });

  it('handles the keyed multimedia object with absolute urls', async () => {
    const { fetchImpl } = jsonFetch({
      response: {
        docs: [
          {
            headline: { main: 'T' },
            web_url: 'https://nyt/2',
            multimedia: { default: { url: 'https://static.nyt.com/b.jpg' } },
          },
        ],
      },
    });
    const [article] = await nytProvider.fetchArticles({
      filters: emptyFilters(),
      config: baseConfig,
      fetchImpl,
    });
    expect(article.imageUrl).toBe('https://static.nyt.com/b.jpg');
  });

  it('turns selected bylines into an fq clause', async () => {
    const { fetchImpl, calls } = jsonFetch({ response: { docs: [] } });
    await nytProvider.fetchArticles({
      filters: { ...emptyFilters(), authors: ['Naomi Sturges'] },
      config: baseConfig,
      fetchImpl,
    });
    expect(decodeURIComponent(calls[0]).replaceAll('+', ' ')).toContain(
      'fq=byline:("Naomi Sturges")'
    );
  });
});

describe('fixtureProvider', () => {
  it('returns every fixture article, already normalised', async () => {
    const articles = await fixtureProvider.fetchArticles({ filters: emptyFilters() });
    expect(articles).toHaveLength(fixtureCount);
    expect(articles.every((a) => a.id && a.publishedAt && a.sourceLabel)).toBe(true);
  });

  it('needs no configuration', () => {
    expect(fixtureProvider.isConfigured(readConfig({}))).toBe(true);
  });
});

describe('resolveProviders', () => {
  it('falls back to the fixture when nothing is configured', () => {
    const providers = resolveProviders(readConfig({}));
    expect(providers.map((p) => p.id)).toEqual(['fixture']);
    expect(isFixtureMode(providers)).toBe(true);
  });

  it('auto-detects every provider whose key is present', () => {
    expect(resolveProviders(baseConfig).map((p) => p.id)).toEqual(['newsapi', 'guardian', 'nyt']);
  });

  it('uses only the keys that exist', () => {
    const config = readConfig({ VITE_GUARDIAN_KEY: 'gu-key' });
    expect(resolveProviders(config).map((p) => p.id)).toEqual(['guardian']);
  });

  it('lets VITE_NEWS_SOURCES override auto-detection', () => {
    const config = readConfig({ VITE_NEWSAPI_KEY: 'k', VITE_NEWS_SOURCES: 'fixture' });
    expect(resolveProviders(config).map((p) => p.id)).toEqual(['fixture']);
  });

  it('ignores unknown ids in VITE_NEWS_SOURCES', () => {
    const config = readConfig({ VITE_NEWS_SOURCES: 'nope,fixture' });
    expect(resolveProviders(config).map((p) => p.id)).toEqual(['fixture']);
  });
});

describe('readConfig', () => {
  it('applies documented defaults', () => {
    const config = readConfig({});
    expect(config.pageSize).toBe(12);
    expect(config.requestTimeoutMs).toBe(8000);
    expect(config.summarizer.provider).toBe('local');
  });

  it('rejects a non-numeric page size instead of producing NaN', () => {
    expect(readConfig({ VITE_PAGE_SIZE: 'lots' }).pageSize).toBe(12);
  });

  it('never exposes a model API key to the bundle', () => {
    expect(readConfig({ VITE_SUMMARY_API_KEY: 'leak' }).summarizer.key).toBeUndefined();
  });
});

describe('provider call shape', () => {
  it('passes the abort signal through to fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await newsApiProvider.fetchArticles({
      filters: emptyFilters(),
      config: baseConfig,
      signal: controller.signal,
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
