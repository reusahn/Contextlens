# OriginTrace

OriginTrace investigates a clip using sampled-frame clues, available captions and
transcripts, web sources, and checked publication metadata. Its reports show
related coverage and uncertainty; they do not establish an original upload.

## Start locally

Requires Node.js 22.13 or newer and FFmpeg for uploaded video processing.
From this directory, run `npm install`. Copy `.env.example` to `.env` only for
a new installation; preserve an existing `.env` and accounting database.

Configure these backend settings in `origintrace-web/.env`:

```dotenv
META_API_KEY=your_meta_api_key
META_MODEL=muse-spark-1.3
META_API_DISABLED=false
SEARCH_PROVIDER=meta
```

The extension's `bridge/.env` is a separate configuration file and is not loaded
by OriginTrace. Never put credentials in frontend variables prefixed `VITE_`.

To enable hosted search, explicitly accept best-effort search accounting:

```dotenv
META_SEARCH_BILLING_MODE=best_effort
```

The default `strict` mode blocks hosted search. The shared $100 ledger reserves
estimated query costs and retains rate/concurrency limits and emergency stops,
but cannot guarantee a hard $100 ceiling on hosted-search charges. Do not delete
the ledger to unblock requests. See [operations](docs/OPERATIONS.md).

Run `npm run dev` and open `http://localhost:5173`. Restart the backend after
changing environment settings. `npm run doctor -w backend` checks local tools,
configuration presence, and accounting state without making provider calls.

## Instagram URL analysis

For posts that require login, a local installation can explicitly enable Chrome
session extraction in `.env` with `INSTAGRAM_COOKIES_BROWSER=chrome` (or
`chrome:Profile 1`). Sign into Instagram in that Chrome profile first. yt-dlp
reads the browser session locally; the app does not send cookies to Meta or
export a cookies file. macOS may ask for Keychain access. With this setting,
the backend binds to `127.0.0.1`; do not expose it through a public proxy.
Restart the backend after changing the setting. Remove it for anonymous mode.

The URL path remains: retrieve metadata, resolve the video URL, temporarily fetch
video bytes, sample frames and transcribe available audio, then search for context.
No manual upload is required. Access restrictions can still prevent retrieval;
video-only sources support vision but have no soundtrack to transcribe.

## Meta web context retrieval

The compatible API is [Meta search grounding](https://dev.meta.ai/docs/search-grounding):
`POST https://api.meta.ai/v1/responses` with model `muse-spark-1.3`,
`tools: [{"type":"web_search"}]`, and `include: ["web_search_call.results"]`.
This capability is unavailable through Chat Completions.

`backend/services/metaSearch.js` converts retrieved hits and citation URLs to
source records. `sourceDiscovery.js` uses those records for direct article
retrieval, date checks, ranking, and comparison. Meta is the default provider;
Tavily remains available only as an explicitly selected legacy provider.

Meta decides whether to search. A response without a completed web search is
not treated as evidence. Generated answer text is never used as article content
or a verified date. Historical dates in search prompts are hints, not enforced
date filters. Article retrieval still uses the application's public-page fetcher;
hosted search replaces source discovery, not every page fetch.

## Content category reports

Reports open with an overview: content category chart, a horizontal timeline of
dated coverage, and a brief context description. Undated sources are listed
separately. The timeline represents publication order, not confirmed copying or
a verified footage lineage; its spacing does not measure elapsed time.
“See the full report” expands all sources, extracted text, search diagnostics,
historical comparisons, and limitations. The same button collapses the details.
JSON export always includes the complete report, regardless of the visible layer.

New investigations include a content profile in the search-results section and
in exported JSON (`categoryReport`). Six fixed hexagonal radar axes group 23
assigned formats; the complete format list also includes Other for unsupported
formats. Detailed tags and exact shares appear next to the chart. Subject tags
(Food, Politics, Music, and so on) remain separate from presentation formats.
Expand the tag-list disclosure for the complete taxonomy.

Meta returns relative format weights in the existing sampled-frame analysis
request; this feature adds no inference calls. Without usable model weights,
explicit English/Korean text cues provide a labelled fallback, with equal weight
per matched format. Text that only establishes a subject does not invent a format.
These estimates may miss synonyms, negation, or formats without clear text cues.
Related article text is excluded. Missing evidence produces an empty chart.

All percentages are normalized relevance shares, not calibrated probabilities,
video-time measurements, or authenticity scores. This feature does not resolve
Instagram media-access restrictions.

## Checks

```bash
npm run check
npm test -w backend
```

Provider tests use mocked responses; they do not establish live key access,
search quality, or real-world footage matching accuracy.
