import { config as defaultConfig } from '../config/env.js';
import { fixtureProvider } from './fixtureProvider.js';
import { guardianProvider } from './guardianProvider.js';
import { newsApiProvider } from './newsApiProvider.js';
import { nytProvider } from './nytProvider.js';
import { assertProvider } from './types.js';

/** Every provider the build knows about. Adding a source means adding it here. */
export const ALL_PROVIDERS = [newsApiProvider, guardianProvider, nytProvider, fixtureProvider].map(
  assertProvider
);

const byId = new Map(ALL_PROVIDERS.map((provider) => [provider.id, provider]));

export function getProvider(id) {
  return byId.get(id) ?? null;
}

/**
 * Decide which providers this run should use.
 *
 * - `VITE_NEWS_SOURCES` set  -> exactly those ids, in that order (explicit wins)
 * - otherwise                -> providers explicitly enabled for the server proxy
 * - nothing configured       -> the local fixture, so the app still renders
 *
 * That last branch is the whole reason a fresh clone shows a populated feed
 * instead of an empty grid and a console error.
 *
 * @returns {import('./types.js').NewsProvider[]}
 */
export function resolveProviders(config = defaultConfig) {
  if (config.enabledSources.length) {
    const chosen = config.enabledSources.map(getProvider).filter(Boolean);
    if (chosen.length) return chosen;
  }
  const configured = ALL_PROVIDERS.filter(
    (provider) => provider.requiresKey && provider.isConfigured(config)
  );
  return configured.length ? configured : [fixtureProvider];
}

/** True when the feed is being served from the checked-in fixture. */
export function isFixtureMode(providers) {
  return providers.every((provider) => provider.id === fixtureProvider.id);
}
