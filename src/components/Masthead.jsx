import PropTypes from 'prop-types';

/**
 * Masthead. The source badges are the honest status line: they say exactly
 * which providers produced what is on screen, fixture included.
 */
export default function Masthead({ providers, fixtureMode, articleCount }) {
  return (
    <header className="masthead">
      <div className="masthead__inner">
        <div>
          <h1 className="masthead__title">
            News <span className="masthead__rule">/</span> Collector
          </h1>
          <p className="masthead__tagline">
            Three newsrooms, one feed. Articles are normalised to a single shape, de-duplicated and
            sorted newest first.
          </p>
        </div>
        <div className="masthead__meta">
          {fixtureMode ? (
            <span className="badge badge--accent" title="No API keys configured">
              Fixture data
            </span>
          ) : (
            providers.map((provider) => (
              <span key={provider.id} className="badge">
                {provider.label}
              </span>
            ))
          )}
          <span className="badge">{articleCount} articles</span>
        </div>
      </div>
    </header>
  );
}

Masthead.propTypes = {
  providers: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, label: PropTypes.string }))
    .isRequired,
  fixtureMode: PropTypes.bool.isRequired,
  articleCount: PropTypes.number.isRequired,
};
