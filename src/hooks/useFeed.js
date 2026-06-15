import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config } from '../config/env.js';
import { paginate } from '../domain/article.js';
import { collectFacets } from '../domain/facets.js';
import { emptyFilters, filtersFromSearchParams, filtersToSearchParams } from '../domain/filters.js';
import { isFixtureMode, resolveProviders } from '../providers/registry.js';
import { loadFeed } from '../services/newsFeed.js';
import { selectSummarizer } from '../ai/summarizer.js';

/** Feed lifecycle. `stale` means "showing old results while a refresh is in flight". */
export const FeedStatus = {
  Loading: 'loading',
  Stale: 'stale',
  Ready: 'ready',
  Error: 'error',
};

const readInitialFilters = () =>
  typeof window === 'undefined' ? emptyFilters() : filtersFromSearchParams(window.location.search);

/**
 * Owns everything the feed page needs: filters, the fetch, pagination and the
 * digest. The components below it are presentational.
 *
 * Filters live in the URL rather than a cookie, so a filtered feed is a link
 * you can send someone and a reload keeps what you were looking at.
 */
export function useFeed({ appConfig = config } = {}) {
  const [filters, setFilters] = useState(readInitialFilters);
  const [articles, setArticles] = useState([]);
  const [facetArticles, setFacetArticles] = useState([]);
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState(FeedStatus.Loading);
  const [page, setPage] = useState(1);
  const [digest, setDigest] = useState(null);
  const requestRef = useRef(0);

  const providers = useMemo(() => resolveProviders(appConfig), [appConfig]);
  const fixtureMode = useMemo(() => isFixtureMode(providers), [providers]);

  useEffect(() => {
    const controller = new AbortController();
    const token = requestRef.current + 1;
    requestRef.current = token;

    setStatus((current) => (current === FeedStatus.Ready ? FeedStatus.Stale : FeedStatus.Loading));

    loadFeed({ filters, config: appConfig, signal: controller.signal })
      .then((result) => {
        if (requestRef.current !== token) return;
        setArticles(result.articles);
        setFacetArticles(result.facetArticles);
        setErrors(result.errors);
        setStatus(
          result.errors.length && result.articles.length === 0 ? FeedStatus.Error : FeedStatus.Ready
        );
        setPage(1);
      })
      .catch((error) => {
        if (requestRef.current !== token) return;
        setErrors([{ sourceId: 'app', sourceLabel: 'Feed', message: error.message }]);
        setStatus(FeedStatus.Error);
      });

    return () => controller.abort();
  }, [filters, appConfig]);

  // Keep the address bar in step with the filters, without adding history entries.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = filtersToSearchParams(filters).toString();
    const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, '', next);
  }, [filters]);

  useEffect(() => {
    let active = true;
    if (articles.length === 0) {
      setDigest(null);
      return undefined;
    }
    selectSummarizer(appConfig)
      .summarizeFeed(articles)
      .then((result) => {
        if (active) setDigest(result);
      });
    return () => {
      active = false;
    };
  }, [articles, appConfig]);

  const visible = useMemo(
    () => paginate(articles, page, appConfig.pageSize),
    [articles, page, appConfig.pageSize]
  );
  const facets = useMemo(() => collectFacets(facetArticles), [facetArticles]);

  const loadMore = useCallback(() => setPage((current) => current + 1), []);
  const resetFilters = useCallback(() => setFilters(emptyFilters()), []);

  return {
    filters,
    setFilters,
    resetFilters,
    articles,
    visible,
    facets,
    errors,
    status,
    digest,
    fixtureMode,
    providers,
    hasMore: visible.length < articles.length,
    loadMore,
  };
}
