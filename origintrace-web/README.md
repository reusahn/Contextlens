# OriginTrace

OriginTrace explores the **“real footage, wrong context”** problem: a genuine recording can be reposted with an inaccurate claim about its date, location, event or identity. The product goal is to make a clip's documented history and contextual discrepancies inspectable through retrievable evidence.

**Current status:** an upload-first research prototype built with Vite and Express. It interprets sampled frames and available text, retrieves related reporting, and presents a qualified evidence report. It does not yet establish that two videos contain the same footage, determine authenticity, or verify the original recording. Results are research leads, not automated fact-check verdicts.

## Project scope

The November 2026 *OriginTrace Product & Research Concept Brief* provides the product direction. Its research question is: **How can we identify reused footage and present a reviewable contextual finding at the point of viewing?**

The proposed product has three layers:

1. Reconstruct earliest located appearances through source discovery.
2. Compare historical and current claims with third-party evidence.
3. Present the footage's lineage and the limits of the evidence.

Intended users are fact-checkers/newsroom verification desks, trust-and-safety/media-monitoring teams, and eventually viewers through an optional overlay. Professional verification is the intended initial use case; the repository currently provides a standalone research UI rather than a deployed professional service or cross-platform overlay.

The hackathon demonstration scope is an upload-first web application using permitted, **nonpolitical, non-war examples**, sampled-frame interpretation, source discovery and an expandable report. Example selection is a project policy; the backend does not enforce a political/war-content classifier. Broader product and research capabilities remain planned where noted in the [scope-to-implementation map](docs/SCOPE.md).

## Implemented features

- Upload MP4, MOV, WebM or MKV video, up to 80 MiB.
- Sample the first frame and up to four additional frames approximately five seconds apart using FFmpeg.
- Analyze sampled frames with Meta AI for visible text, events and identifying clues.
- Use available captions, supplied transcripts or speech-to-text for search clues.
- Retrieve related articles, check publication metadata and rank textual matches.
- Display a **Life history of the footage** timeline of related coverage, optional quote-backed claim comparisons and source-reported modifications. Its chronological links are not verified copying/derivation relationships.
- Keep API credentials on the backend and persist Meta usage accounting in SQLite.

## Contents

- [Project scope](#project-scope)
- [Implemented features](#implemented-features)

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [Commands](#commands)
- [API](#api)
- [How evidence is evaluated](#how-evidence-is-evaluated)
- [Limitations and privacy](#limitations-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Research roadmap and evaluation](#research-roadmap-and-evaluation)
- [Contributing and support](#contributing-and-support)
- [Maintainers and acknowledgments](#maintainers-and-acknowledgments)
- [License](#license)

## Requirements

| Requirement | Purpose |
| --- | --- |
| Node.js **22.13.0 or newer**, with npm | Workspaces, built-in SQLite and backend APIs |
| FFmpeg | Frame extraction and audio conversion |
| Meta Model API key with access to the required models | Frame analysis, optional speech and article comparison |
| Tavily API key | Web retrieval in the recommended strict-budget configuration |
| yt-dlp, optional | Public Instagram caption/media metadata fallback |
| Local Whisper CLI and base model, optional | Alternative to Meta speech transcription |

macOS tool installation, with Homebrew already installed:

```bash
brew install ffmpeg yt-dlp
```

Install Node.js from [nodejs.org](https://nodejs.org/en/download) if it is not available. Other operating systems need equivalent local tools on PATH. A Facebook Graph API token is not a Meta Model API key.

## Quick start

Run these commands from the repository root, the directory containing `video-context-engine/`:

```bash
cd video-context-engine
npm ci
cp .env.example .env
```

If `.env` already exists, edit it instead of overwriting it. Set the following backend configuration:

```dotenv
META_API_KEY=your_meta_model_api_key
META_MODEL=muse-spark-1.3
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=your_tavily_api_key
META_SEARCH_BILLING_MODE=strict
SPEECH_PROVIDER=meta
```

These are placeholders; keep real keys in `.env` and never commit them. The supplied `.env.example` selects `meta` search with strict billing, which intentionally blocks hosted search. Set `SEARCH_PROVIDER=tavily` for this working retrieval configuration.

```bash
npm run doctor -w backend
npm run dev
```

Open **http://127.0.0.1:5173**. Express listens on port **3001** by default; Vite proxies `/api` requests to it. Do not open `frontend/index.html` directly as a file. Use `Ctrl+C` to stop development servers.

The diagnostic command checks tool availability, credential presence and budget status without making provider calls. Generating reports can incur provider charges. See [spending controls](docs/OPERATIONS.md#spending-controls) before using real keys.

## Usage

1. Select **Upload footage** and choose an authorized local video. This is the most reliable way to enable frame and audio analysis.
2. Optionally enter a caption, known names/location, or a spoken quotation/transcript.
3. Generate the report and inspect **Analysis progress**, matched clues, source links, publication evidence and uncertainty.
4. Review **Life history of the footage** for located coverage and claim comparisons. Export the JSON report if needed.

Alternatively, paste a public page or direct video URL. Public metadata and accessible video are retrieved where supported. Instagram extraction may require yt-dlp; restricted pages can still require an upload. Caption or transcript text can support research even when video bytes are inaccessible.

Reports remain in the current browser session's in-memory history. They are not saved to a server-side report database.

## Configuration

The backend loads `video-context-engine/.env`. Restart it after configuration changes. Keep keys out of frontend code and `VITE_*` variables.

| Variable | Default / purpose |
| --- | --- |
| `PORT` | `3001`; backend port |
| `FRONTEND_ORIGIN` | `http://localhost:5173`; allowed browser origin |
| `META_API_KEY` | Backend Meta credential; required for Meta calls |
| `META_MODEL` | `muse-spark-1.3`; only approved frame-analysis model |
| `SEARCH_PROVIDER` | `meta`; use `tavily` for strict-budget retrieval |
| `TAVILY_API_KEY` | Required when `SEARCH_PROVIDER=tavily` |
| `META_SEARCH_BILLING_MODE` | Strict unless explicitly `best_effort`; see below |
| `META_TEXT_COMPARISON` | Enabled unless `false`; compare retrieved article text using Meta |
| `SPEECH_PROVIDER` | `meta`; alternatives: `local` or `off` |
| `LOCAL_WHISPER_ENABLED` | Legacy local-speech selector when `SPEECH_PROVIDER` is unset |
| `PLATFORM_EXTRACTION_ENABLED` | Enabled unless `false`; Instagram yt-dlp fallback |
| `META_API_DISABLED` | Unset or literal `false` allows dispatch; other values stop new Meta calls |
| `META_BUDGET_DB` | `backend/data/meta-budget.sqlite`; persistent shared local ledger |
| `FFMPEG_COMMAND`, `YTDLP_COMMAND`, `WHISPER_COMMAND` | Optional executable paths instead of PATH lookup |

Meta hosted search is implemented but blocked in strict mode. Enabling `SEARCH_PROVIDER=meta` **and** `META_SEARCH_BILLING_MODE=best_effort` uses estimated query accounting and can exceed the intended $100 cutoff. It is not an equivalent replacement for strict-budget retrieval. Read [provider selection](docs/OPERATIONS.md#search-providers) before making that choice.

## Commands

Run from `video-context-engine/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and backend |
| `npm run dev:frontend` / `npm run dev:backend` | Start either service separately |
| `npm run doctor -w backend` | Inspect local prerequisites and budget status |
| `npm test -w backend` | Run mocked provider tests and local integration tests |
| `npm run check` | Check backend and frontend JavaScript syntax |
| `npm run build -w frontend` | Build frontend assets into `frontend/dist/` |
| `npm start` | Start Express only |
| `npm run budget:review -w backend` | Inspect outstanding budget reservations |

Tests make no paid provider calls and use temporary ledgers. Real FFmpeg sampling tests run when FFmpeg is installed. Production hosting of the frontend is not configured by `npm start`.

## API

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/health` | No body | Tool capabilities, credential-presence flags, selected search provider and budget blocking status |
| `POST /api/analyze` | Multipart form with `video` or `url`; optional `caption` and `transcript` | Analysis stages, extracted text/clues, sources, date evidence, conclusion, `lifeHistory` and limitations |

The upload field is named `video`; supported MIME types correspond to MP4, MOV, WebM and MKV. Caption text is capped at 4,000 characters and supplied transcript text at 12,000. Requests missing both video and URL return an input error. Provider failures can produce a partial report with warnings; an HTTP-successful report does not mean every analysis stage succeeded.

Example upload (**can make paid provider calls**):

```bash
curl -X POST http://localhost:3001/api/analyze \
  -F 'video=@/path/to/clip.mp4' \
  -F 'caption=Rescue footage near Dover harbor'
```

## How evidence is evaluated

The workflow is **upload/URL → frames and text → clues → web retrieval → article/date checks → ranked report**. See [architecture](docs/ARCHITECTURE.md) for source-file responsibilities.

Ranking uses a weighted heuristic: **website significance 50%, chronology 30%, textual relevance 20%**. Domain classification is not measured authority or truth. Relevance uses the strongest qualifying short clue or an explicit reference to the submitted URL. Timestamps themselves are never averaged.

A source needs supported, uncontested page publication metadata to establish an earliest located date. Search snippets alone are insufficient. Historical/current claim comparisons require supplied candidate sources, dated ordering and actual quoted text. Source-reported edits are labeled as unverified; the application does not verify transformations between media versions. The active ranking combines domain, chronology and textual relevance into one heuristic score. Independent calibrated source-reliability/provenance scores, visual correspondences and recording/event-date verification described in the concept brief are not implemented.

## Limitations and privacy

- Earliest located coverage is not proof of the first upload, filming time or original creator.
- Text similarity and AI assessments do not prove that sources depict the same footage or that their claims are true. Syndicated sources are not independent corroboration.
- Five sampled frames and at most 180 seconds of speech provide partial coverage. Recognition, language handling and keyword matching can fail.
- The application does not perform reverse-video matching or cryptographic C2PA manifest validation. A SHA-256 fingerprint identifies exact bytes, not authenticity or edit history.
- Search indexes, login restrictions, dynamic pages, paywalls and unavailable publication dates limit coverage. Public URL retrieval does not bypass access controls.
- Keys stay on the backend. Meta receives the images, audio or text required by enabled features; Tavily receives search queries when selected; direct article requests contact source websites.
- Uploads and temporary media are deleted after normal request cleanup. A process crash may leave files that need local cleanup. Budget accounting persists separately.
- The proposed in-video overlay, side-by-side clip comparison, matched video timecodes, persistent evidence graph and human-review/correction queue are not implemented.
- Authentication, full endpoint abuse protection and production deployment hardening are not complete. Review [operations and deployment](docs/OPERATIONS.md#deployment-and-data-handling) before public hosting.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Backend offline | Start `npm run dev`; inspect the backend terminal and configured ports |
| FFmpeg or yt-dlp missing | Run the diagnostic command; install tools or configure absolute executable paths |
| AI blocked / concurrency limit | Review outstanding reservations; follow the [operator procedure](docs/OPERATIONS.md#reviewing-outstanding-requests) |
| Search disabled or blocked | Check provider/key settings; strict Meta hosted search intentionally dispatches nothing |
| Metadata retrieved, video unavailable | Upload the clip or supply caption/transcript; a page title does not supply video bytes |
| No related reports | Review query failures, extracted clues and candidate/rejection counts; try a specific quotation or location |
| No earliest date | Related results may lack verified publication dates; do not infer dates from result order |
| npm reports no workspace | Use the workspace directory, or run `node backend/budgetReview.js` there for budget review |

## Research roadmap and evaluation

The concept brief proposes staged work; these are research directions, not delivered features or delivery commitments:

1. **Curated demonstrator:** add perceptual/embedding-based visual sequence matching and contextual claim consistency checks for a permitted set of clips. Evaluate origin-match candidates against known examples.
2. **Professional workflow:** develop a versioned evidence API, persistent provenance/evidence relationships, a review queue and correction/audit workflow.
3. **Cross-platform presentation:** investigate permitted source reuse, richer appearance histories and an accessible in-video overlay with expandable evidence and matched timecodes.

Planned benchmarks are manual InVID-assisted verification and a text-only fact-check retrieval baseline. Measure clip-matching precision/recall, contextual contradiction accuracy, abstention quality, source coverage and reviewer time. Current automated tests cover software behavior, mocked provider responses and local media processing; they do not establish those research metrics, production reliability, measured speedups or market novelty. See [research scope and gaps](docs/SCOPE.md#evaluation-and-research-claims).

## Contributing and support

Use this repository's issue tracker, if enabled, for reproducible bugs and feature requests. Include reproduction steps, Node/tool versions, relevant analysis-stage messages and sanitized logs. Do not post keys, private videos, personal data or raw credential files. Report suspected credential exposure privately to the repository owner rather than in a public issue.

Keep pull requests focused, explain the resulting behavior and run the test, syntax-check and frontend-build commands above. Provider integrations should include mocked success/failure tests and preserve backend spending controls. Do not make paid calls in automated tests.

## Maintainers and acknowledgments

Maintained by the OriginTrace project contributors. See the repository's contribution history for attribution. Individual developer names or public GitHub handles may be listed here when the team chooses to publish them.

Built with Node.js, Express, Vite, FFmpeg, Meta Model API, optional Tavily, and optional yt-dlp/Whisper. The provenance presentation is informed by the [Content Authenticity Initiative and C2PA Content Credentials](https://contentauthenticity.org/how-it-works); OriginTrace does not claim their cryptographic verification or endorsement.

## License

No `LICENSE` file is currently included. A project license has not yet been declared; maintainers should choose and add one before presenting this as a licensed open-source release. Dependency licenses remain separate.
