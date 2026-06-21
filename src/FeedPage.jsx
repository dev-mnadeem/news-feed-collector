import { config } from './config/env.js';
import ArticleCard from './components/ArticleCard.jsx';
import DigestPanel from './components/DigestPanel.jsx';
import FilterBar from './components/FilterBar.jsx';
import Masthead from './components/Masthead.jsx';
import { EmptyState, SkeletonGrid, SourceErrors } from './components/FeedStates.jsx';
import { activeFilterCount } from './domain/filters.js';
import { FeedStatus, useFeed } from './hooks/useFeed.js';

/**
 * The single page. All state lives in `useFeed`; this composes the view and
 * decides which of the four feed states to render.
 */
export default function FeedPage() {
  const feed = useFeed();
  const isFirstLoad = feed.status === FeedStatus.Loading;
  const activeCount = activeFilterCount(feed.filters);

  return (
    <>
      <Masthead
        providers={feed.providers}
        fixtureMode={feed.fixtureMode}
        articleCount={feed.articles.length}
      />

      <main className="shell">
        <DigestPanel digest={feed.digest} />

        <FilterBar
          filters={feed.filters}
          facets={feed.facets}
          onChange={feed.setFilters}
          onReset={feed.resetFilters}
        />

        <SourceErrors errors={feed.errors} />

        <section aria-live="polite">
          <div className="feed__head">
            <h2 className="feed__title">Latest</h2>
            <p className="feed__count">
              {isFirstLoad
                ? 'Loading…'
                : `Showing ${feed.visible.length} of ${feed.articles.length}`}
              {activeCount > 0 ? ` · ${activeCount} filters active` : ''}
            </p>
          </div>

          {isFirstLoad ? <SkeletonGrid count={config.pageSize} /> : null}

          {!isFirstLoad && feed.visible.length === 0 ? (
            <EmptyState hasFilters={activeCount > 0} onReset={feed.resetFilters} />
          ) : null}

          {!isFirstLoad && feed.visible.length > 0 ? (
            <ul className="grid">
              {feed.visible.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </ul>
          ) : null}

          {feed.hasMore ? (
            <div className="loadmore">
              <button type="button" className="button button--primary" onClick={feed.loadMore}>
                Load more ({feed.articles.length - feed.visible.length} remaining)
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
