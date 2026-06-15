/**
 * Filter options derived from the articles actually on screen.
 *
 * The category and author lists are not hard-coded and not fetched from a
 * separate endpoint: every option here is a value that appears in the current
 * feed, so selecting one can never produce an empty result by construction.
 */

/** Facet values rarer than this are dropped from the author list to keep it usable. */
export const MIN_AUTHOR_COUNT = 1;

function tally(articles, pick) {
  const counts = new Map();
  for (const article of articles) {
    const value = pick(article);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

const toSortedOptions = (counts, minCount) =>
  [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));

/**
 * @returns {{sources: {value: string, label: string, count: number}[],
 *            categories: {value: string, count: number}[],
 *            authors: {value: string, count: number}[]}}
 */
export function collectFacets(articles) {
  const sourceLabels = new Map();
  for (const article of articles) sourceLabels.set(article.sourceId, article.sourceLabel);

  return {
    sources: toSortedOptions(
      tally(articles, (a) => a.sourceId),
      1
    ).map((option) => ({
      ...option,
      label: sourceLabels.get(option.value) ?? option.value,
    })),
    categories: toSortedOptions(
      tally(articles, (a) => a.category),
      1
    ),
    authors: toSortedOptions(
      tally(articles, (a) => a.author),
      MIN_AUTHOR_COUNT
    ),
  };
}
