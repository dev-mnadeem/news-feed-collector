import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ArticleCard from '../src/components/ArticleCard.jsx';
import { createArticle } from '../src/domain/article.js';

const article = createArticle({
  sourceId: 'guardian',
  sourceLabel: 'The Guardian',
  title: 'Seed bank digitises a century of germination records',
  description: 'Index cards become a searchable dataset.',
  url: 'https://example.com/guardian/seed-bank-digitised',
  imageUrl: 'https://images.example.com/seed-bank.jpg',
  publishedAt: '2026-09-24T09:00:00.000Z',
  author: 'Eleanor Rhys',
  category: 'Science',
});

const renderCard = (value = article) =>
  render(
    <ul>
      <ArticleCard article={value} />
    </ul>
  );

describe('ArticleCard', () => {
  it('uses the publisher image while it loads', () => {
    const { container } = renderCard();
    expect(container.querySelector('img').getAttribute('src')).toBe(article.imageUrl);
  });

  it('swaps a broken publisher image for the generated cover', () => {
    const { container } = renderCard();
    const image = container.querySelector('img');
    fireEvent.error(image);
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  });

  it('gives the two links distinct accessible names', () => {
    renderCard();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName(
      'Seed bank digitises a century of germination records (opens in a new tab)'
    );
    expect(links[1]).toHaveAccessibleName(
      'Read at source: Seed bank digitises a century of germination records (opens in a new tab)'
    );
  });
});
