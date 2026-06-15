import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import FeedPage from './FeedPage.jsx';
import './styles/main.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FeedPage />
  </StrictMode>
);
