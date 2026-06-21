import PropTypes from 'prop-types';
import { formatPublished, generatedCover } from '../domain/article.js';
import { summarizeText } from '../ai/localSummarizer.js';

/**
 * One story.
 *
 * The TL;DR line is the extractive summary, not the raw description — on a feed
 * mixing three sources the descriptions vary from one clause to three sentences,
 * and picking the strongest sentence makes the grid readable.
 */
export default function ArticleCard({ article }) {
  const cover = article.imageUrl || generatedCover(article);
  const summary = summarizeText(article.description || article.title);

  return (
    <li className="card">
      <img className="card__cover" src={cover} alt="" loading="lazy" />
      <div className="card__body">
        <p className="card__meta">
          <span className="card__source">{article.sourceLabel}</span>
          {article.category ? <span className="card__dot">{article.category}</span> : null}
          <span className="card__dot">{formatPublished(article)}</span>
        </p>
        <h3 className="card__title">
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {article.title}
          </a>
        </h3>
        <p className="card__summary">{summary}</p>
        <div className="card__foot">
          <span>{article.author || article.sourceLabel}</span>
          <a className="card__link" href={article.url} target="_blank" rel="noopener noreferrer">
            Read at source →
          </a>
        </div>
      </div>
    </li>
  );
}

ArticleCard.propTypes = {
  article: PropTypes.shape({
    id: PropTypes.string,
    title: PropTypes.string,
    description: PropTypes.string,
    url: PropTypes.string,
    imageUrl: PropTypes.string,
    publishedAt: PropTypes.string,
    sourceLabel: PropTypes.string,
    author: PropTypes.string,
    category: PropTypes.string,
  }).isRequired,
};
