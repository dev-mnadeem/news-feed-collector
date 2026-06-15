import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import ChipGroup from './ChipGroup.jsx';
import { activeFilterCount } from '../domain/filters.js';

/** Keystrokes settle for this long before a refetch is triggered. */
export const KEYWORD_DEBOUNCE_MS = 300;

const toggle = (list, value) =>
  list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

/**
 * Filter controls.
 *
 * The keyword box is debounced so typing "technology" is one request, not ten.
 * Everything else commits immediately — a chip click is already a deliberate act.
 */
export default function FilterBar({ filters, facets, onChange, onReset }) {
  const [keywordDraft, setKeywordDraft] = useState(filters.keywords);

  useEffect(() => setKeywordDraft(filters.keywords), [filters.keywords]);

  useEffect(() => {
    if (keywordDraft === filters.keywords) return undefined;
    const timer = setTimeout(
      () => onChange({ ...filters, keywords: keywordDraft }),
      KEYWORD_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [keywordDraft, filters, onChange]);

  const setList = (key) => (value) => onChange({ ...filters, [key]: toggle(filters[key], value) });
  const activeCount = activeFilterCount(filters);

  return (
    <section className="filters" aria-label="Filter the feed">
      <div className="filters__row">
        <label className="field">
          <span className="field__label">Search</span>
          <input
            className="field__input"
            type="search"
            placeholder="Headlines, summaries and bylines"
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Published from</span>
          <input
            className="field__input"
            type="date"
            value={filters.from}
            onChange={(event) => onChange({ ...filters, from: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Published to</span>
          <input
            className="field__input"
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ ...filters, to: event.target.value })}
          />
        </label>
        <button type="button" className="button" onClick={onReset} disabled={activeCount === 0}>
          Clear{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>

      <div className="facets">
        <ChipGroup
          legend="Source"
          options={facets.sources}
          selected={filters.sources}
          onToggle={setList('sources')}
        />
        <ChipGroup
          legend="Section"
          options={facets.categories}
          selected={filters.categories}
          onToggle={setList('categories')}
        />
        <ChipGroup
          legend="Byline"
          options={facets.authors}
          selected={filters.authors}
          onToggle={setList('authors')}
        />
      </div>
    </section>
  );
}

const optionShape = PropTypes.arrayOf(
  PropTypes.shape({ value: PropTypes.string, label: PropTypes.string, count: PropTypes.number })
);

FilterBar.propTypes = {
  filters: PropTypes.shape({
    keywords: PropTypes.string,
    sources: PropTypes.arrayOf(PropTypes.string),
    categories: PropTypes.arrayOf(PropTypes.string),
    authors: PropTypes.arrayOf(PropTypes.string),
    from: PropTypes.string,
    to: PropTypes.string,
  }).isRequired,
  facets: PropTypes.shape({
    sources: optionShape,
    categories: optionShape,
    authors: optionShape,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
};
