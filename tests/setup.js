import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearFeedCache } from '../src/services/newsFeed.js';

afterEach(() => {
  cleanup();
  // The feed cache is module-level by design; tests must not inherit each
  // other's entries.
  clearFeedCache();
});
