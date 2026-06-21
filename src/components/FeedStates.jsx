import PropTypes from 'prop-types';

/** Placeholder cards shown while the first fetch is in flight. */
export function SkeletonGrid({ count }) {
  return (
    <ul className="grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li className="card" key={index}>
          <div className="skeleton card__cover" />
          <div className="card__body">
            <div className="skeleton" style={{ height: '0.75rem', width: '40%' }} />
            <div className="skeleton" style={{ height: '1.4rem' }} />
            <div className="skeleton" style={{ height: '1.4rem', width: '80%' }} />
            <div className="skeleton" style={{ height: '2.5rem' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

SkeletonGrid.propTypes = { count: PropTypes.number.isRequired };

/** Shown when filters exclude everything — with the way out, not just the news. */
export function EmptyState({ hasFilters, onReset }) {
  return (
    <div className="empty">
      <h3 className="empty__title">Nothing matches</h3>
      <p className="empty__body">
        {hasFilters
          ? 'No article in the current feed satisfies every filter. Try removing the narrowest one — a byline or a date bound.'
          : 'No provider returned an article. Check the source status above, or run without API keys to browse the bundled fixture.'}
      </p>
      {hasFilters ? (
        <button type="button" className="button button--primary" onClick={onReset}>
          Clear all filters
        </button>
      ) : null}
    </div>
  );
}

EmptyState.propTypes = {
  hasFilters: PropTypes.bool.isRequired,
  onReset: PropTypes.func.isRequired,
};

/**
 * Partial failure is the normal failure here: these APIs are rate-limited, and
 * one of them going down should cost you that source, not the page.
 */
export function SourceErrors({ errors }) {
  if (errors.length === 0) return null;
  return (
    <div className="notice notice--warn" role="status">
      <p className="notice__title">
        {errors.length === 1 ? 'One source failed' : `${errors.length} sources failed`} — the rest
        of the feed is unaffected
      </p>
      <ul className="notice__list">
        {errors.map((error) => (
          <li key={error.sourceId}>
            <strong>{error.sourceLabel}</strong>: {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

SourceErrors.propTypes = {
  errors: PropTypes.arrayOf(
    PropTypes.shape({
      sourceId: PropTypes.string,
      sourceLabel: PropTypes.string,
      message: PropTypes.string,
    })
  ).isRequired,
};
