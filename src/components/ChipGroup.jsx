import PropTypes from 'prop-types';

/** How many facet values to offer before the list becomes noise. */
export const MAX_VISIBLE_CHIPS = 10;

/**
 * A multi-select rendered as toggle buttons.
 *
 * Toggle buttons rather than a dropdown because every option carries a count,
 * and the counts are the useful part: you can see that "Science" has four
 * stories before you click it.
 */
export default function ChipGroup({ legend, options, selected, onToggle }) {
  if (options.length === 0) return null;

  return (
    <fieldset className="facet" style={{ border: 0, margin: 0, padding: 0 }}>
      <div className="facet__head">
        <legend className="field__label">{legend}</legend>
      </div>
      <div className="chips">
        {options.slice(0, MAX_VISIBLE_CHIPS).map((option) => {
          const isOn = selected.includes(option.value);
          return (
            <button
              type="button"
              key={option.value}
              className="chip"
              aria-pressed={isOn}
              onClick={() => onToggle(option.value)}
            >
              {option.label ?? option.value}
              <span className="chip__count">{option.count}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

ChipGroup.propTypes = {
  legend: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string,
      count: PropTypes.number,
    })
  ).isRequired,
  selected: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired,
};
