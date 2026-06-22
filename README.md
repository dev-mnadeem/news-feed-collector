# News Collector

Three newsrooms — [NewsAPI](https://newsapi.org), [The Guardian](https://open-platform.theguardian.com)
and the [New York Times](https://developer.nytimes.com) — publish the same kind of thing in three
incompatible shapes. This pulls all three, flattens them into one `Article`, and renders a single
filterable feed.

![The feed, running with no API keys against the bundled fixture](docs/screenshots/feed.png)

It runs with **no API keys at all**. When nothing is configured the provider registry falls back to
a checked-in fixture of 24 articles, so `npm run dev` on a fresh clone gives you the page above
rather than an empty grid and a console error.

---

## Running it

```bash
npm ci
npm run dev          # http://localhost:7141
```

Use Node 22. Fixture mode needs only the Vite process. For live sources, put keys in the
server environment and enable the matching public source IDs:

```bash
cp .env.example .env.local
# set NEWSAPI_KEY / GUARDIAN_KEY / NYT_KEY; never prefix secrets with VITE_
# set VITE_NEWS_SOURCES=guardian,nyt (only sources with configured server keys)
npm run server       # terminal 1: loopback proxy on port 7150
npm run dev          # terminal 2: Vite forwards /api/news to the proxy
```

For a production-style local run, build with `npm run build`, start `npm run server`,
and open http://127.0.0.1:7150. The Node server serves both `dist/` and the proxy.

Other scripts: `npm test`, `npm run lint`, `npm run build`, `npm run preview`.

---

## Where the articles come from

Each source is a module in `src/providers/` satisfying one interface (`src/providers/types.js`):

| Provider | Id | Needs a key | Narrows upstream by |
|---|---|---|---|
| News API | `newsapi` | yes | keywords, date range, categories |
| The Guardian | `guardian` | yes | keywords, date range, categories |
| The New York Times | `nyt` | yes | keywords, date range, categories, byline |
| Local fixture | `fixture` | no | nothing — returns all 24 |

`resolveProviders()` picks the set to use: whatever `VITE_NEWS_SOURCES` names, otherwise the fixture. Nothing above the registry knows which branch was taken —
the UI just receives `Article[]`.

Because the three upstream APIs support *different* filters, narrowing happens twice: each provider
sends what its own API understands, then `applyFilters` runs over the merged result. Without that
second pass a byline filter would silently apply to NYT articles and not to Guardian ones.

---

## One refresh, end to end

```mermaid
flowchart TB
    subgraph providers["src/providers — one module per source"]
        NA["newsApiProvider"]
        GU["guardianProvider"]
        NY["nytProvider"]
        FX["fixtureProvider<br/>24 checked-in articles"]
    end

    REG{"resolveProviders<br/>live source IDs enabled?"}
    REG -- "yes" --> NA & GU & NY
    REG -- "no" --> FX

    NA & GU & NY --> PROXY["Same-origin proxy: fixed upstreams, server-held keys"]
    PROXY --> NORM
    FX --> NORM["createArticle<br/>one Article shape"]
    NORM --> FOLD["Promise.allSettled<br/>failures collected, not thrown"]
    FOLD --> DEDUPE["dedupe by source+url,<br/>sort newest first"]
    DEDUPE --> FACETS["collectFacets<br/>source / section / byline options"]
    DEDUPE --> FILTER["applyFilters<br/>second pass, same rules for every source"]
    FILTER --> PAGE["paginate<br/>12 per page"]
    PAGE --> GRID["article grid"]
    FACETS --> CHIPS["filter chips"]
    FILTER --> DIGEST["summarizeFeed<br/>local extractive digest"]
```

Two things in that diagram are load-bearing:

**`Promise.allSettled`, not `Promise.all`.** These APIs are rate-limited and go down independently.
A failed source becomes a named entry in a banner above the feed; the other sources still render.
`tests/newsFeed.test.js` pins this with a provider that always throws.

**Facets come from the *unfiltered* set.** If the filter chips were derived from the filtered
result, selecting "The Guardian" would delete the other two source chips and strip you of any way
back. The feed service returns both lists for exactly this reason.

---

## Adding a fourth newsroom

Write a module exporting an object with `id`, `label`, `requiresKey`, `supports`, `isConfigured()`
and `fetchArticles()`, mapping the response through `createArticle`. Add it to `ALL_PROVIDERS` in
`src/providers/registry.js`. That is the entire change — `assertProvider` will fail loudly at import
time if the shape is wrong, and `tests/providers.test.js` runs its interface check over every
registered provider automatically.

---

## The digest

The panel at the top of the page is the one AI-shaped feature here, and it is deliberately small:
"where is this feed weighted, and what is the representative story in each of those sections".

It runs behind a provider interface (`src/ai/summarizer.js`) with two implementations:

- **`local` (default)** — no key, no network, fully deterministic. It groups articles by the section
  their publisher assigned, ranks sections by story count, and picks each section's most
  representative story by content-word overlap with the rest of that section. The per-card TL;DR
  line uses the same machinery on a single article: the sentence whose content words recur most.
- **`remote` (opt-in)** — posts to `VITE_SUMMARY_API_URL`, **an endpoint you host**, which holds the
  model key. Vite inlines `VITE_*` values into the browser bundle, so a model API key put in `.env`
  would ship to every visitor. Any failure — no URL, non-2xx, a body with no `bullets` — falls back
  to the local digest, so the panel always renders.

Why sections rather than mined keywords: across a few dozen short abstracts, raw term frequency
surfaces newsroom filler ("report", "published", "since") rather than subjects. The section is a
label an editor already chose.

---

## Filters live in the URL

Selecting a source, a section, a byline or a date bound rewrites the query string, so a filtered
feed is a link you can send someone and a reload keeps what you were looking at.

![Three filters applied, with every other option still selectable](docs/screenshots/filtered.png)

The keyword box is debounced by 300 ms so typing a word is one request rather than one per
keystroke, and fetched feeds are cached for 60 seconds keyed on `providers + filters` — a browser
reload, or toggling a chip off and on again, costs nothing against a rate-limited key.

---

## Configuration

Browser configuration is read in `src/config/env.js`; server secrets are read only by `server/index.js`, so tests can build
a config object and hand it to the registry without touching globals. Full list with comments in
[`.env.example`](.env.example); the ones you are most likely to touch:

| Variable | Default | Purpose |
|---|---|---|
| `NEWSAPI_KEY` / `GUARDIAN_KEY` / `NYT_KEY` | empty | server-only provider credentials |
| `VITE_NEWS_SOURCES` | empty | explicit allow-list, e.g. `guardian,nyt` or `fixture` |
| `VITE_PAGE_SIZE` | `12` | articles per page before "Load more" |
| `VITE_REQUEST_TIMEOUT_MS` | `8000` | per-request abort deadline |
| `VITE_SUMMARY_PROVIDER` | `local` | `local` or `remote` |

Malformed numeric values fall back to the default rather than becoming `NaN`.

---

## Tests

```
$ npm test

 Test Files  8 passed (8)
      Tests  110 passed (110)
```

Vitest with jsdom. The suite covers the domain helpers, the HTTP layer (timeout, abort, non-2xx,
query building), each provider's wire-format mapping — including both shapes NYT has shipped for
`multimedia` — registry resolution, the fan-out and its partial-failure and cache behaviour, the
summariser and its fallbacks, and an integration pass over the rendered app in
`tests/feedPage.test.jsx`.

`npm run test:server` adds three native HTTP tests for server-held credentials,
parameter allowlisting, sanitized failures and oversized responses.

Those integration tests run with no environment variables set, which is the same state a fresh
clone is in, so they also assert that the app is usable with no API keys.

`npm run lint` (ESLint 9 flat config, `eslint-plugin-react` + `react-hooks`) reports no errors or
warnings.

---

## Containers

```bash
docker compose up --build       # http://localhost:7141
```

Node 22 builds the frontend, then a non-root Node runtime serves the built files and proxy.
Only source IDs/page size are build arguments. Provider keys are runtime environment variables,
so they do not enter the browser bundle or image build layers. Copy `.env.example` to `.env`
for Compose interpolation, or export the variables before running Compose.

Container startup was not exercised because the local Docker daemon was unavailable.
Native build, UI tests and actual local proxy HTTP tests were exercised instead.

---

## What this does not do

- **The proxy is a local demonstration boundary.** Fixed upstream destinations, accepted query
  fields, an eight-second deadline, 2 MB response cap, and a process-wide 60 requests/minute
  limit bound requests. Errors omit upstream URLs and credentials. Before public deployment,
  add authentication, per-user quotas and shared rate limiting; multiple instances do not
  share this in-memory budget.
- **One page of upstream results per source.** NewsAPI and the Guardian are asked for 40 articles
  each; NYT returns whatever its default page holds. The feed then paginates client-side over the
  merged set — no cursor is plumbed through to the upstream APIs, so "Load more" cannot reach page
  two of any of them.
- **Saved articles, accounts and push are absent.** There is no persistence beyond the query string.
- **Sections are not reconciled across sources.** The Guardian's "Tech" and NYT's "Tech" merge by
  luck of naming; NewsAPI reports its originating outlet in the same field. A source-to-canonical
  section map would fix it.

## Author

[**Muhammad Nadeem**](https://github.com/dev-mnadeem)
