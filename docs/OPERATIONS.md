# Operations

This guide covers operation of OriginTrace's current application: provider configuration, spending controls, evidence handling and deployment requirements. The full project vision is defined in [scope](SCOPE.md), and implemented versus planned components are described in [architecture](ARCHITECTURE.md). Start with the [application README](../README.md) for local setup.

The settings below describe current controls and their assumptions. Pricing is pinned to the verification date listed below; check it before a new deployment.

## Spending controls

Meta calls share a cumulative **$100 USD** ledger with no automatic reset. The default database is `backend/data/meta-budget.sqlite`, relative to the application directory. Configure `META_BUDGET_DB` to an absolute persistent local path for deployment. All workers must share it; independent databases have independent allowances.

SQLite `BEGIN IMMEDIATE` transactions atomically check the budget, rate and concurrency limits before recording a reservation. WAL and FULL synchronous commits persist accounting before dispatch. Five Meta calls per client IP per rolling minute and two outstanding executions are allowed. These limits cover Meta dispatch, not every HTTP request or Tavily charge. IP identity is a fallback because the app has no authenticated-user system.

Configured prices were checked against [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits) on October 31, 2026. They are pinned in code and not refreshed automatically:

| Request | Configured price | Reservation |
| --- | --- | --- |
| Muse Spark text/frame analysis | $1.25/M input tokens; $4.25/M output tokens | $1.323008 per request |
| Muse Voice transcription | $0.18/hour, billed in whole seconds | $0.009 for the 180-second ceiling |
| Optional hosted Meta search | Same text rates, plus $2.50/1,000 queries | Maximum text reservation plus an estimate of eight queries: $1.343008 |

Text/frame reservation uses the full 1,048,576-token context minus the enforced 4,096 completion-token maximum as the input ceiling. This conservatively covers images without a guessed image tokenizer. It assumes the provider enforces its documented context/output bounds and counts reasoning in output usage. Backend request bounds include five frames, 1 MiB base64 per frame, 1 KiB filename metadata and an 8 MiB serialized text request. WAV format/sample-count validation enforces mono 16-bit PCM, supported sample rates and at most 180 seconds before speech dispatch.

Valid reported usage reconciles reservations. Known terminal responses without complete usage release execution capacity while retaining the full unpriced monetary reservation. Uncertain failures, timeouts, malformed/nonterminal responses and crashes retain both cost and slot. Unexpected reported usage beyond configured limits records the greater cost and persistently disables Meta. Calls are not automatically retried.

Set `META_API_DISABLED=true` and restart workers to stop new Meta dispatch. Operators can also set the shared database control `disabled=1` for an immediate shared stop. Existing remote requests are not cancelled.

Back up the ledger with SQLite-aware backup tooling and preserve it across deployments. Deleting/replacing it resets accounting. Network filesystem locking and separately mounted replica disks are not supported. This application accounting does not cover other key users, taxes, currency conversion, prior charges, changed prices or inaccurate provider usage. Tavily has a separate quota. Use a dedicated key and provider-side account controls where available.

## Search providers

### Tavily with strict Meta accounting

```dotenv
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=your_tavily_api_key
META_SEARCH_BILLING_MODE=strict
```

Retrieval uses up to six advanced queries, up to eight hits per query, followed by at most twelve direct article checks. Historical reconstruction can reserve two query slots for date-filtered searches. Provider date hints help discovery but do not establish verified publication dates. Search concurrency is two; article-fetch concurrency is three. Tavily charges are outside the Meta ledger.

### Optional Meta hosted search

```dotenv
SEARCH_PROVIDER=meta
META_SEARCH_BILLING_MODE=best_effort
```

Only select this after accepting **best-effort**, rather than strict worst-case, spending protection for hosted search. The [Meta Responses API schema](https://dev.meta.ai/docs/api-reference/responses/schemas) limits built-in tool calls, but permits multiple billed queries within one search action without a documented maximum. Therefore `max_tool_calls:1` is not a query-cost ceiling.

The adapter combines clues into one request with `store:false`, `max_output_tokens:4096`, `max_tool_calls:1` and the web-search tool. Eight query charges are estimated before dispatch. Reported tokens and output-action query counts reconcile against the ledger. Unknown counts retain the estimate; excess reported queries disable subsequent Meta calls. Charges can exceed the estimate, and actual spend can exceed $100 before reconciliation. In strict mode this adapter dispatches nothing. There is no silent provider fallback.

Only returned hits and citation URLs become candidates. Model narrative is not treated as article content or verified dates. Historical date wording is a search hint rather than Tavily's server-side date filter. Direct article retrieval, date verification and relevance ranking still apply.

## Speech and public media

Speech defaults to Meta unless legacy `LOCAL_WHISPER_ENABLED=true` selects local mode while `SPEECH_PROVIDER` is unset. Use `SPEECH_PROVIDER=local` explicitly for Whisper, or `off` to disable speech. Available subtitles and supplied transcripts take priority; otherwise FFmpeg converts accessible video to WAV. Meta speech needs model access to `muse-voice-transcribe-1.0`. Local Whisper requires its CLI and base model; the CLI may download the model on first use, so preinstall/cache it for offline operation.

Instagram-only yt-dlp metadata extraction has a 45-second timeout and 2 MiB output cap. It ignores user config, does not load cookies, and performs no media or playlist downloads itself. Returned direct media/subtitle URLs use backend public-IP, DNS-pinning and redirect checks. Restricted downloads and adaptive manifests remain unsupported. Set `PLATFORM_EXTRACTION_ENABLED=false` to disable the fallback.

## Reviewing outstanding requests

Run from `video-context-engine/`:

```bash
npm run doctor -w backend
npm run budget:review -w backend
```

Tool availability and key presence do not prove API access. The diagnostic also identifies budget/concurrency blockers. Budget review lists outstanding reservation IDs locally; there is no public reservation-reset endpoint.

Only after independently confirming a provider execution has ended:

```bash
npm run budget:review -w backend -- --confirm-terminal RESERVATION_ID
```

This releases only the execution slot, retains all accounted cost, and does not clear an emergency disable. Never confirm termination merely to restore capacity. Existing uncertain requests are not automatically expired or refunded. If workspace resolution fails, run `node backend/budgetReview.js` from the application directory.

## Deployment and data handling

The current development stack is Vite → `/api` proxy → Express. `npm start` serves the backend only. Production frontend hosting, TLS and a production reverse proxy are not configured.

Before public deployment, implement authenticated endpoint quotas and review file signature checking, malware scanning, request-duration limits, access logging/redaction and temporary-file cleanup after crashes. Express does not trust forwarded-IP headers by default. Configure trusted proxies deliberately; otherwise users behind a proxy may share one IP quota. CORS is not authentication.

API keys remain backend-only. Ignored `.env` files, uploaded media, logs and SQLite state must not be committed. Provider requests contain the images, audio, snippets and queries needed by enabled features; inspect provider data policies before submitting sensitive material. The ledger stores reservation/accounting information and hashed IP identities; operator overrides can add local review metadata. It is not a report archive.

Temporary files are removed in normal cleanup paths, but crashes can leave residue. Use a suitable private upload/temp directory and an operational cleanup policy. Do not delete the ledger with temporary files or depend on container-ephemeral storage for its persistence.

## Running the hackathon demonstration

Use the upload-first workflow as the primary demonstration path. Select permitted, nonpolitical, non-war clips with manually checked source records. Include one contextual discrepancy, one consistent-context case and one inconclusive case. Example selection is an operator policy; the backend does not enforce a political/war-content classifier.

Before the demonstration:

1. Run the documented diagnostics and inspect outstanding reservations. Verify actual provider access with a bounded test; key presence alone does not establish access.
2. Confirm the active search and speech providers, remaining budget and persistent ledger location. The documented Meta allowance is **$100**, independent of any promotional credit balance.
3. Check that the selected sources and clips remain accessible and that the reference records distinguish publication dates, recording dates and claimed event dates.
4. Inspect report rendering, source links, quotes, date labels and inconclusive outcomes. Do not present related coverage as a confirmed visual match.
5. Record the run configuration, elapsed time, outcome and available usage/accounting data without exposing credentials or personal identifiers.

Live retrieval may return different evidence between runs. If using a prepared report as a fallback, label it as a saved demonstration result and retain its run context; do not present it as a fresh live investigation. Exported reports currently require operator-managed storage; the budget ledger is not a report archive.

Successful demonstration criteria and evaluation metrics are defined in [scope](SCOPE.md). A working pipeline does not establish complete provenance, measured fact-checking accuracy or improved viewer understanding.

## Evidence presentation and review

Operational review should preserve the distinction between what the clip visibly contains, what retrieved sources say and what OriginTrace infers.

| Report element | Interpretation and review rule |
| --- | --- |
| Model clue | A search lead; inspect it before treating it as an observed fact. |
| Related source | Evidence to assess, not proof that the source contains matching footage. |
| Publication timestamp | A date associated with the source or post; do not substitute it for a recording date. |
| Earliest located result | Bounded by the sources searched and accessible during that run; not a guaranteed original upload. |
| Ranking score | The documented ranking heuristic, not a probability of truth or falsity. |
| Timeline edge | Chronological order in the current implementation, not demonstrated copying. |
| Reported modification | A source's account unless direct media comparison independently supports it. |
| Contextual finding | A reviewable assessment that must retain source support and uncertainty. |

Missing sources, inaccessible media or conflicting dates should remain explicit. Do not remove uncertainty labels to make a demonstration appear complete. When interpreting a discrepancy, check whether a post explicitly labels footage as archival or illustrative.

The application currently offers link inspection and report export, not an authenticated correction queue or adjudication audit trail. Operator notes and manually verified reference records are separate from application functionality.

## Operating the broader project

The full project adds visual lineage, persistent evidence relationships, review workflows and potentially an at-viewing overlay. Each expansion needs its own implementation and operational validation:

- **Visual matching:** evaluate false matches, crops, excerpts and aligned timecodes before presenting confirmed footage relationships.
- **Persistent evidence:** define access, retention, deletion and correction procedures separately from accounting data.
- **Public access:** implement authenticated quotas and production hosting controls before treating IP-based dispatch limits as user-level protection.
- **At-viewing presentation:** validate accessibility, uncertainty labels and links to evidence, including when contextual coverage is incomplete.

These are future operating requirements, not controls already provided by the current application.
