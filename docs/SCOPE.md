# Project scope

**OriginTrace is a contextual guide to the changing stories behind viral videos.** It helps users investigate what a clip depicts, locate earlier appearances, and examine how its captions, descriptions and claims have changed through circulation.

This document defines the full project vision, the hackathon deliverable and the boundary between implemented and planned capabilities. The implementation map describes the documented application behavior; planned capabilities are identified separately.

## Purpose and intended users

**Authentic footage can still tell a misleading story.** In short-form social media, the same clip can circulate with different dates, locations, identities or event descriptions. Its original circumstances can disappear while new interpretations accumulate, leaving viewers with real imagery but an inaccurate understanding of what it shows.

OriginTrace aims to make missing context accessible before viewers accept or share a claim. Its intended social contribution is informed interpretation and media literacy: users can inspect what supports a contextual finding, explore alternative descriptions and recognize what remains unknown. Improved understanding and reduced sharing of misleading content are impact goals, not measured outcomes.

Intended users include everyday viewers, newsroom/fact-checking teams, media researchers and trust-and-safety/media-monitoring teams. The initial standalone workflow supports deliberate investigation; an optional at-viewing overlay is a later distribution direction. These intended uses do not establish adoption or production readiness.

## Core question and product layers

**How can we help people understand a viral clip by revealing its documented context, earlier appearances and changing narratives?**

The project brings together three layers:

1. **Context discovery:** extract visual and textual clues and retrieve evidence about what the footage depicts.
2. **Claim comparison:** examine whether accompanying claims about date, location, event and identity agree with available evidence.
3. **Footage lineage:** organize documented appearances over time and reveal changes in the clip's framing and presentation.

The technical investigation asks how multimodal analysis, source discovery and a temporal evidence interface can support this workflow. Current reports partially demonstrate the layers using related text coverage. They do not establish visual footage identity or a derivative chain.

## Full project workflow

The intended user journey begins with a short video and an optional caption or claim:

1. Extract searchable subjects, text, settings and distinctive details from sampled frames and available clip text. Treat model interpretations as search leads.
2. Discover candidate appearances and reporting, retaining URLs, available timestamps, excerpts and search-query context.
3. Assess whether sources contain matching footage, concern a related event or show a similar scene. Compare submitted claims with source evidence where possible.
4. Build a documented appearance timeline, highlighting changes in captions, descriptions and claims. Record visible crops, overlays or other edits only when source media can be compared.
5. Present a concise contextual finding with expandable evidence, timeline entries and unresolved questions. Without a submitted claim, focus on located context and appearances.

These steps describe the full project workflow. Their implementation status is specified below.

## Creative perspective: a clip's changing story

OriginTrace treats a viral clip as a story that acquires new meanings through circulation. The envisioned visual lineage timeline places located appearances side by side so users can inspect what each post claims and how its presentation changes.

The interface must distinguish related reporting, candidate footage appearances and confirmed media matches. Timeline order must remain separate from a demonstrated reuse relationship. A post's later date does not prove it copied an earlier source.

The current **Life history of the footage** report presents retrieved context and dated related coverage. Verified visual lineage, matched timecodes and side-by-side media comparison remain development goals.

## Scope-to-implementation map

| Project capability | Documented implementation | Gap / qualification |
| --- | --- | --- |
| Upload-first ingestion with caption, on-screen text and transcript | [Express route](../backend/routes/analysis.js) receives video or URL plus optional supplied text; [analyzer](../backend/services/videoAnalyzer.js) samples frames and orchestrates caption/speech extraction | Caption/media retrieval depends on access and tools. On-screen text is best-effort model interpretation of sampled frames, not exhaustive OCR. |
| Representative keyframes and visual fingerprinting | FFmpeg selects the first frame and additional frames about five seconds apart; [file identity](../backend/services/footageHistory.js) computes exact-byte SHA-256 | Sampling is time-based, not scene-adaptive. No perceptual hashes, embeddings, sequence alignment, crop matching or excerpt-to-long-source matching are implemented. SHA-256 is not a visual fingerprint. |
| Cross-platform source discovery | [Discovery](../backend/services/sourceDiscovery.js) uses Tavily or optional best-effort Meta search, then checks selected articles; public URL metadata and an Instagram-specific fallback are available | No dedicated fact-check API, curated-source index, authenticated platform ingestion, screenshot collection or search guarantee. A related event article is not automatically an appearance of the footage. |
| Earliest located appearances | Historical searches and [publication metadata checks](../backend/services/evidenceRanking.js) support a dated coverage timeline | Search-only dates are not sufficient verification. The original recording, filming date and first upload remain unestablished. |
| Evidence reconciliation with frame correspondences | Textual clue overlap, explicit submitted-URL references and optional model excerpt comparisons | No frame-to-frame media correspondence, visual similarity confidence, source-independence reconciliation or calibrated reliability/provenance measures. |
| Claims about date, place, event and identity | [Meta comparison](../backend/services/metaComparison.js) can assess article excerpts, return up to four dated claim pairs and retain supported quotations | No dedicated structured event/date/place/identity claim extractor or validated contradiction classifier. It compares retrieved claims with clip clues; it does not independently resolve their truth. |
| Footage lineage and modification history | [Life history](../backend/services/footageHistory.js) contains timeline nodes, chronological edges, source-reported modifications and explicit unknowns | Edges mean chronology only. No verified derivative links, detected media edits or complete modification history. C2PA manifests are not read or validated. |
| Provenance/evidence graph | Per-report JSON includes sources, dates, claim pairs and timeline nodes/edges | No persistent graph store, stable cross-report asset identities, versioned evidence API or verification-event ledger. SQLite currently stores spending controls, not a provenance archive. |
| Status badge, expandable evidence and side-by-side context | [Standalone frontend](../frontend/src/main.js) renders status, source cards, quoted claim comparisons and JSON export | No in-video badge, platform/browser extension, side-by-side video player, matched timecodes or overlay accessibility/placement implementation. Status is a preliminary contextual assessment, not “X% false.” |
| Human review and correction | Users can inspect links and export reports | No authenticated reviewer queue, correction submission, adjudication or review audit trail. |
| Research evaluation | Mocked provider/control tests, multipart routing tests and real local FFmpeg tests where available | No labeled clip-matching benchmark, baseline study, contradiction-accuracy result or reviewer-time experiment. Passing tests is not measured fact-checking performance. |

## Hackathon deliverable and acceptance criteria

The hackathon focuses on one complete upload-to-context-report workflow: an upload-first Vite/Express application, FFmpeg sampling, Meta interpretation, source discovery and an inspectable report. These components are documented as partially implemented; access, configuration, provider budget state and returned evidence determine which report stages complete.

Demonstration cases should include:

- Reused footage accompanied by a misleading date, location or event claim.
- Footage whose accompanying claim agrees with the available evidence.
- An inconclusive case where the system should report insufficient evidence.

Each case needs a manually checked reference record of known sources, dates and context. A successful demonstration:

- Completes upload, clue extraction, retrieval and report rendering.
- Surfaces a documented contextual discrepancy with accessible source evidence.
- Keeps model interpretations, source statements and contextual findings distinguishable.
- Presents an inconclusive outcome without inventing a source, visual match or lineage.
- Records processing time, provider configuration and API cost or accounting limitations.

This is a demonstration target, not a claim that these criteria have already been met. A discrepancy supported by reporting does not itself validate footage matching.

Use authorized **nonpolitical, non-war examples** for demonstrations, such as a sports clip or an animal-rescue repost with known context. This is a scope policy, not an automatic backend content filter. Do not claim that the repository has verified compliance with event-specific rules or submission terms.

Direct visual sequence matching, a reviewer/correction workflow and an at-viewing overlay remain outside the current implemented boundary. Continuous monitoring, comprehensive manipulation detection, blockchain provenance and production newsroom integrations are outside the hackathon deliverable. Search-provider swapping does not implement those capabilities.

## Interpreting evidence and scores

The active `rankMatched()` path in [evidenceRanking.js](../backend/services/evidenceRanking.js) combines website class (50%), chronology (30%) and textual relevance (20%). This is a transparent editorial heuristic. It is not independently calibrated source reliability, a provenance confidence measure or the probability that a claim is false. The older exported `scoreEvidence()` helper is not the active discovery-ranking path.

Publication date, post date, recording date and claimed event date are distinct. Earlier coverage can motivate review but does not by itself contradict a later post: archival footage can be correctly labeled as archival. Text comparisons can suggest contradiction, different context, consistency or uncertainty; the report must preserve quotations, source links and limits instead of declaring an automated verdict.

A credible source can still be wrong, and several sources may repeat the same report. The code does not verify source independence, resolve corrections across publishers or adjudicate disputed events. Model-assisted quote checks restrict outputs to retrieved excerpts; they do not make the excerpts true.

The C2PA/Content Credentials reference is a design influence, not a cryptographic-verification integration. Exact-byte fingerprints and inferred web coverage cannot substitute for validated signed manifests or media-version correspondence.

## Evaluation and impact measurement

Evaluate the current workflow first using relevant-source retrieval, source support for contextual findings, appropriate inconclusive outcomes, processing time and API cost. Use manually checked reference records and document the queries, timestamps and configuration for each run.

The broader evaluation proposes comparison with **manual InVID-assisted verification** and a **text-only fact-check retrieval baseline**. These baselines are not integrated or evaluated in this repository. Planned measurements include:

- Clip-matching precision and recall, including crops, excerpts and near-duplicate scenes.
- Accuracy of contextual contradiction findings about date, event, location and identity.
- Abstention quality when evidence is missing, conflicting or ambiguous.
- Source coverage and the basis for earliest-located publication dates.
- Reviewer time and effort compared with the manual baseline.

A reproducible evaluation needs a permitted, labeled dataset, documented baseline procedures and separation of test cases from development examples. Clip-matching and lineage claims require direct media comparison and corresponding ground truth; text-retrieval results cannot substitute for those measurements.

Longer-term user studies should measure whether users better distinguish recording dates from publication dates, identify unsupported contextual claims and recognize uncertainty. Measure changes in sharing decisions separately from comprehension; neither can be inferred from backend accuracy alone.

No measured speedup, matching accuracy, automated fact-checking accuracy, validated research novelty, market superiority or social-impact result is claimed. The proposed contribution is an inspectable integration of contextual investigation and temporal narrative comparison; its benefits remain to be demonstrated.

## Staged direction

1. **Contextual investigation:** complete and evaluate the upload-to-report workflow using curated clips and evidence-linked findings.
2. **Visual lineage:** implement and evaluate direct media matching, matched timecodes and comparisons of visible edits and accompanying claims.
3. **Review and reuse:** add persistent evidence relationships, a versioned evidence API and human review/correction workflows.
4. **Context at viewing:** develop broader platform coverage and an accessible optional overlay that links to evidence without covering critical content.

These stages describe scope, not release dates or confirmed delivery commitments. Platform access, copyright, retention, privacy, third-party labeling, provider costs and relevant event/submission IP terms need review before broader distribution. No legal compliance or production readiness is established by this document.

See [operations](OPERATIONS.md) for current provider, spending and deployment constraints and the [application README](../README.md) for setup.
