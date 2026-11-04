# OriginTrace

OriginTrace investigates a clip using sampled-frame clues, available captions and
transcripts, web sources, and checked publication metadata. Its reports show
related coverage and uncertainty; they do not establish an original upload.

The report presents four outputs at a glance:

- **Clip category graph:** a hexagonal radar chart shows the relative relevance
  of six format families, with detailed tags, percentages and a separate subject
  label such as Food, Politics or Music.
- **Footage timeline:** a horizontal timeline places confirmed matching uploads
  and the submitted post in chronological order when supported upload dates are
  available. Connections do not prove copying or identify the first uploader.
- **Related-context timeline:** directly beneath the footage timeline, a separate
  horizontal graph shows related reporting by publication date, with source links
  and short excerpts. Undated sources appear separately. This graph can still be
  populated when footage dates or matching uploads are unavailable.
- **Brief context description:** a short explanation of the available clip
  context. **See the full report** reveals sources, matching evidence, extracted
  text, search diagnostics and limitations.

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

## Category graph and footage timeline

Reports open with an overview: content category chart, footage timeline,
related-context timeline, and a brief context description. Undated sources are
listed separately. Timeline spacing does not measure elapsed time. Related
reporting follows publication order and is kept separate from footage-upload
evidence; it does not establish a verified lineage.
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

## Origin assessment

The origin section now uses four evidence-based statuses:

- **origin unknown:** no reviewed footage match with a supported upload date.
- **earliest matching upload located:** the earliest dated confirmed match in the
  investigation; this does not establish a globally first upload.
- **creator attribution supported:** matching footage has reviewed attribution
  with at least two distinct supporting evidence URLs.
- **earlier upload found:** a confirmed matching upload predates the supported
  publication time of the submitted post.

All applicable findings are retained. The headline prioritizes an earlier upload,
then supported attribution, then the earliest matching upload, otherwise unknown.
Related article dates never qualify as upload evidence.

`assessOrigin()` in `backend/services/footageHistory.js` consumes server-produced
matching evidence. A match needs confirmed exact-file equality or a reviewed
sequence match, plus a verified platform/reviewed timestamp or an explicitly
labelled page-supported `VideoObject.uploadDate`. Page metadata is the publisher's
claim, not independent proof of when the video was uploaded. Attribution still
requires reviewed corroboration and cannot be asserted through the public request
or model output. Legacy `unestablished` labels display as **origin unknown**.

## Technical implementation: footage matching

OriginTrace uses **SHA-256 (Secure Hash Algorithm, 256-bit)** to compare complete
video files. The server hashes the submitted footage and each downloaded
candidate, checks that the submitted file contains decodable video, and compares
the digests. Equal digests confirm an exact file match. Re-encoding, cropping or
editing can change the hash even when videos share footage, so non-identical
files also undergo sampled-frame sequence comparison using FFmpeg, perceptual
fingerprints and color patterns. SHA-256 is not used to infer visual similarity,
the original creator, or a first-upload date.

The matcher returns four user-facing result categories:

| Category | Meaning | Effect on origin assessment |
| --- | --- | --- |
| **Confirmed** | Exact video-file match using SHA-256. | Can support a matching-upload finding when an explicit supported upload date is also available. |
| **Possible match** | A similar ordered frame sequence was found in non-identical files. | Requires review; does not automatically establish origin. |
| **No match** | No qualifying sequence was found within the sampled windows. | No matching-upload finding; this does not rule out a match elsewhere in the videos. |
| **Unavailable / not checked** | Media could not be retrieved or decoded, no candidate/reference was available, or matching was disabled. | No footage-match claim is made. |

These comparison categories are separate from the four **origin assessment**
statuses above: origin unknown, earliest matching upload located, creator
attribution supported, and earlier upload found. Matching footage alone cannot
establish who created it or who uploaded it first.

The implementation is in [footageMatching.js](backend/services/footageMatching.js),
with origin findings evaluated in [footageHistory.js](backend/services/footageHistory.js).
The category graph is rendered by [contentCategories.js](frontend/src/contentCategories.js),
and the horizontal timeline and report layers by [reportView.js](frontend/src/reportView.js).

`backend/services/footageMatching.js` now runs after source discovery when the
submitted video bytes are available. It finds accessible candidate video files
in retrieved pages (`VideoObject.contentUrl`, Open Graph video and HTML video
sources). Alternatively, expand **Compare with a known video** in the input form
and paste a direct video URL or a page containing accessible footage. This is a
comparison tool, not a reverse-video search index or an Instagram access bypass.
Candidate retrieval does not read Chrome cookies or run platform extractors.
Use content you are permitted to retrieve and process.

For non-identical files, FFmpeg decodes up to the first 30 seconds at 2 fps.
The sequence comparator requires six consecutive similar frames, at least 60%
coverage of the shorter sampled sequence, three visually distinct frames, color
agreement and perceptual-hash agreement. Aligned timestamps are shown for review.
These thresholds are heuristics, not calibrated probabilities. Crops, overlays,
speed changes, static clips, late excerpts and uncaptured scenes may cause missed
matches; a negative result only describes the sampled windows.

The full report shows every attempted comparison, its method, available upload
date, exact hash or aligned frame times, and limitations. Exported JSON includes
`footageVerification`. Article publication dates and search dates cannot substitute
for upload evidence. Conflicting video upload dates remain unconfirmed.

Checks use the existing public-address-pinned HTTP fetcher and local FFmpeg, not
paid Meta inference. Default limits: two candidates (configurable 1–3 using
`FOOTAGE_MATCH_MAX_CANDIDATES`), 30 MiB per remote response, 60 sampled frames per
video, and a shared 20-second network/decoding budget. Temporary candidate files
are deleted after processing. Set `FOOTAGE_MATCH_ENABLED=false` to disable this
additional stage. No extra Meta API calls are made.

Real FFmpeg fixture tests cover identical files, transcoded copies, excerpts,
unrelated and static footage, upload-date provenance and cleanup. They do not
establish accuracy on real Instagram videos. Creator attribution review and broad
cross-platform visual discovery remain unimplemented.

## Checks

```bash
npm run check
npm test -w backend
```

Provider tests use mocked responses; they do not establish live key access,
search quality, or real-world footage matching accuracy.
