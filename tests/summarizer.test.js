import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config/env.js';
import { createArticle } from '../src/domain/article.js';
import {
  groupBySection,
  localSummarizer,
  representativeArticle,
  summarizeText,
} from '../src/ai/localSummarizer.js';
import { remoteSummarizer, selectSummarizer } from '../src/ai/summarizer.js';
import { splitSentences, tokenize } from '../src/ai/tokens.js';

const article = (overrides) =>
  createArticle({
    sourceId: 'guardian',
    sourceLabel: 'The Guardian',
    url: `https://example.com/${Math.random()}`,
    ...overrides,
  });

describe('tokens', () => {
  it('drops stopwords and short tokens', () => {
    expect(tokenize('The rail link is open')).toEqual(['rail', 'link', 'open']);
  });

  it('splits on sentence-final punctuation', () => {
    expect(splitSentences('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?']);
  });
});

describe('summarizeText', () => {
  it('picks the sentence carrying the most repeated terms', () => {
    const text =
      'Storage projects cleared the queue. Queue reform prioritised storage projects with signed offtake. Permitting remains the constraint.';
    expect(summarizeText(text)).toBe(
      'Queue reform prioritised storage projects with signed offtake.'
    );
  });

  it('is deterministic', () => {
    const text = 'Alpha beta gamma. Delta epsilon zeta. Alpha beta delta.';
    expect(summarizeText(text)).toBe(summarizeText(text));
  });

  it('returns a single sentence unchanged when that is all there is', () => {
    expect(summarizeText('Only one sentence here.')).toBe('Only one sentence here.');
  });

  it('returns an empty string for empty input rather than throwing', () => {
    expect(summarizeText('')).toBe('');
  });

  it('truncates at a word boundary with an ellipsis', () => {
    const long = `${'word '.repeat(60)}end.`;
    const summary = summarizeText(long);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(181);
  });
});

describe('groupBySection', () => {
  const corpus = [
    article({ title: 'A', description: 'Storage projects move ahead.', category: 'Business' }),
    article({ title: 'B', description: 'Storage capacity grows.', category: 'Business' }),
    article({ title: 'C', description: 'A cross-border rail service.', category: 'World News' }),
  ];

  it('groups by the section the provider assigned', () => {
    const groups = groupBySection(corpus);
    expect([...groups.keys()]).toEqual(['Business', 'World News']);
    expect(groups.get('Business')).toHaveLength(2);
  });

  it('falls back to the source label when an article has no section', () => {
    const groups = groupBySection([article({ title: 'D', description: 'x.', category: '' })]);
    expect([...groups.keys()]).toEqual(['The Guardian']);
  });

  it('returns an empty map for an empty feed', () => {
    expect(groupBySection([]).size).toBe(0);
  });
});

describe('representativeArticle', () => {
  it('returns null for an empty group', () => {
    expect(representativeArticle([])).toBeNull();
  });

  it('returns the only member of a single-article group', () => {
    const only = article({ title: 'Solo', description: 'One story.' });
    expect(representativeArticle([only])).toBe(only);
  });

  it('picks the article sharing the most vocabulary with its group', () => {
    const group = [
      article({ title: 'Outlier headline', description: 'Completely unrelated wording here.' }),
      article({ title: 'Storage queues clear', description: 'Storage projects move ahead.' }),
      article({ title: 'Storage projects grow', description: 'Storage projects move ahead.' }),
    ];
    expect(representativeArticle(group).title).not.toBe('Outlier headline');
  });
});

describe('localSummarizer.summarizeFeed', () => {
  const corpus = [
    article({ title: 'A', description: 'Storage projects move ahead.', category: 'Business' }),
    article({ title: 'B', description: 'Storage capacity grows.', category: 'Business' }),
    article({ title: 'C', description: 'A cross-border rail service.', category: 'World News' }),
  ];

  it('ranks sections by story count', async () => {
    const digest = await localSummarizer.summarizeFeed(corpus);
    expect(digest.provider).toBe('local');
    expect(digest.articleCount).toBe(3);
    expect(digest.bullets[0]).toMatchObject({ term: 'Business', count: 2 });
  });

  it('never repeats a headline across bullets', async () => {
    const digest = await localSummarizer.summarizeFeed(corpus);
    const headlines = digest.bullets.map((b) => b.headline);
    expect(new Set(headlines).size).toBe(headlines.length);
  });

  it('fronts each section with a real headline from that section', async () => {
    const digest = await localSummarizer.summarizeFeed(corpus);
    expect(['A', 'B']).toContain(digest.bullets[0].headline);
  });

  it('returns no bullets for an empty feed', async () => {
    expect((await localSummarizer.summarizeFeed([])).bullets).toEqual([]);
  });
});

describe('selectSummarizer', () => {
  it('defaults to the local summariser', () => {
    expect(selectSummarizer(readConfig({})).id).toBe('local');
  });

  it('only picks remote when both the flag and a url are set', () => {
    expect(selectSummarizer(readConfig({ VITE_SUMMARY_PROVIDER: 'remote' })).id).toBe('local');
    expect(
      selectSummarizer(
        readConfig({ VITE_SUMMARY_PROVIDER: 'remote', VITE_SUMMARY_API_URL: 'https://d/api' })
      ).id
    ).toBe('remote');
  });
});

describe('remoteSummarizer', () => {
  const corpus = [
    article({ title: 'Storage queues clear', description: 'Storage projects move ahead.' }),
    article({ title: 'More storage online', description: 'Storage capacity grows.' }),
  ];
  const config = readConfig({
    VITE_SUMMARY_PROVIDER: 'remote',
    VITE_SUMMARY_API_URL: 'https://digest.test/api',
  });

  it('uses the remote bullets when the endpoint answers correctly', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        bullets: [{ term: 'grid', count: 2, headline: 'H', sourceLabel: 'S' }],
      }),
    });
    const digest = await remoteSummarizer.summarizeFeed(corpus, { config, fetchImpl });
    expect(digest.provider).toBe('remote');
    expect(digest.bullets[0].term).toBe('grid');
  });

  it('falls back to the local digest when the endpoint fails', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const digest = await remoteSummarizer.summarizeFeed(corpus, { config, fetchImpl });
    expect(digest.provider).toBe('local');
  });

  it('falls back when the endpoint returns a body with no bullets', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ text: 'hi' }) });
    const digest = await remoteSummarizer.summarizeFeed(corpus, { config, fetchImpl });
    expect(digest.provider).toBe('local');
  });

  it('falls back immediately when no url is configured', async () => {
    const digest = await remoteSummarizer.summarizeFeed(corpus, { config: readConfig({}) });
    expect(digest.provider).toBe('local');
  });
});
