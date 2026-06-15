import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeedPage from '../src/FeedPage.jsx';
import { DEFAULT_PAGE_SIZE } from '../src/config/env.js';
import { fixtureCount } from '../src/providers/fixtureProvider.js';

/**
 * These run with no environment variables set, which is exactly the state a
 * reviewer's fresh clone is in — so they also assert that the app is usable
 * with no API keys.
 */
const renderApp = async () => {
  window.history.replaceState(null, '', '/');
  const user = userEvent.setup();
  render(<FeedPage />);
  await screen.findByText(`${fixtureCount} articles`);
  return user;
};

const cards = () => screen.getAllByRole('heading', { level: 3 });

describe('FeedPage', () => {
  it('renders a populated feed with no API keys configured', async () => {
    await renderApp();
    expect(screen.getByText('Fixture data')).toBeInTheDocument();
    expect(cards()).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it('shows the digest built from the visible articles', async () => {
    await renderApp();
    const digest = await screen.findByRole('region', { name: /where the feed is weighted/i });
    expect(
      within(digest).getByText(/Generated locally — no API key, no network call/)
    ).toBeInTheDocument();
  });

  it('paginates rather than dumping every article at once', async () => {
    const user = await renderApp();
    const remaining = fixtureCount - DEFAULT_PAGE_SIZE;
    const loadMore = screen.getByRole('button', { name: `Load more (${remaining} remaining)` });
    await user.click(loadMore);
    expect(cards()).toHaveLength(fixtureCount);
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('narrows the feed by source and writes the choice into the URL', async () => {
    const user = await renderApp();
    await user.click(screen.getByRole('button', { name: /^The Guardian/ }));
    await waitFor(() => expect(window.location.search).toBe('?sources=guardian'));
    await waitFor(() => expect(screen.getByText('8 articles')).toBeInTheDocument());
    // The other two sources must still be selectable after narrowing to one.
    expect(screen.getByRole('button', { name: /^The New York Times/ })).toBeInTheDocument();
  });

  it('searches across headlines and summaries', async () => {
    const user = await renderApp();
    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'floodplain');
    await waitFor(() => expect(screen.getByText('1 articles')).toBeInTheDocument());
    expect(cards()[0]).toHaveTextContent(/Rewilded floodplain/);
  });

  it('offers a way out of an empty result instead of a bare message', async () => {
    const user = await renderApp();
    await user.type(screen.getByRole('searchbox', { name: /search/i }), 'zzzznothing');
    const empty = await screen.findByText('Nothing matches');
    expect(empty).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(cards()).toHaveLength(DEFAULT_PAGE_SIZE));
  });

  it('restores filters from the query string on load', async () => {
    window.history.replaceState(null, '', '/?sources=nyt');
    render(<FeedPage />);
    await waitFor(() => expect(screen.getByText('8 articles')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^The New York Times/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
