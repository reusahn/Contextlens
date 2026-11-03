# Product and research scope

This document translates the supplied **OriginTrace Product & Research Concept Brief — November 2026, concept-stage proposal** into an implementation map. The brief defines intent; source files define current behavior. Planned capabilities must not be presented as deployed or validated results.

## Purpose and intended users

OriginTrace investigates contextual misuse of short video: footage may be genuine while a repost's associated claim about time, location, event or identity is inaccurate. The product goal is a reviewable, evidence-linked contextual finding at the point of viewing. The prototype does not test whether a recording itself is genuine.

Intended users are newsroom/fact-checking teams, platform trust-and-safety/media-monitoring teams, and eventually viewers. The intended initial professional-verification use case and possible consumer overlay are product hypotheses, not evidence of adoption, commercial readiness or an implemented distribution surface.

The proposed three-layer solution is earliest-located appearance discovery, historical/current claim comparison, and footage-lineage presentation. Current reports partially demonstrate these layers using related text coverage. They do not establish visual footage identity or a derivative chain.

## Scope-to-implementation map

| Brief capability | Current code behavior | Gap / qualification |
| --- | --- | --- |
| Upload-first ingestion with caption, on-screen text and transcript | [Express route](../backend/routes/analysis.js) receives video or URL plus optional supplied text; [analyzer](../backend/services/videoAnalyzer.js) samples frames and orchestrates caption/speech extraction | Caption/media retrieval depends on access and tools. On-screen text is best-effort model interpretation of sampled frames, not exhaustive OCR. |
| Representative keyframes and visual fingerprinting | FFmpeg selects the first frame and additional frames about five seconds apart; [file identity](../backend/services/footageHistory.js) computes exact-byte SHA-256 | Sampling is time-based, not scene-adaptive. No perceptual hashes, embeddings, sequence alignment, crop matching or excerpt-to-long-source matching are implemented. SHA-256 is not a visual fingerprint. |
| Cross-platform source discovery | [Discovery](../backend/services/sourceDiscovery.js) uses Tavily or optional best-effort Meta search, then checks selected articles; public URL metadata and an Instagram-specific fallback are available | No dedicated fact-check API, curated-source index, authenticated platform ingestion, screenshot collection or search guarantee. A related event article is not automatically an appearance of the footage. |
| Earliest located appearances | Historical searches and [publication metadata checks](../backend/services/evidenceRanking.js) support a dated coverage timeline | Search-only dates are not sufficient verification. The original recording, filming date and first upload remain unestablished. |
| Evidence reconciliation with frame correspondences | Textual clue overlap, explicit submitted-URL references and optional model excerpt comparisons | No frame-to-frame media correspondence, visual similarity confidence, source-independence reconciliation or calibrated reliability/provenance measures. |
| Claims about date, place, event and identity | [Meta comparison](../backend/services/metaComparison.js) can assess article excerpts, return up to four dated claim pairs and retain supported quotations | No dedicated structured event/date/place/identity claim extractor or validated contradiction classifier. It compares retrieved claims with clip clues; it does not independently resolve their truth. |
| Footage lineage and modification history | [Life history](../backend/services/footageHistory.js) contains timeline nodes, chronological edges, source-reported modifications and explicit unknowns | Edges mean chronology only. No verified derivative links, detected media edits or complete modification history. C2PA manifests are not read or validated. |
| Provenance/evidence graph | Per-report JSON includes sources, dates, claim pairs and timeline nodes/edges | No persistent graph store, stable cross-report asset identities, versioned evidence API or verification-event ledger. SQLite currently stores spending controls, not a provenance archive. |
| Status badge, expandable evidence and side-by-side context | [Standalone frontend](../frontend/src/main.js) renders status, source cards, quoted claim comparisons and JSON export | No in-video badge, platform/browser extension, side-by-side video player, matched timecodes or overlay accessibility/placement implementation. Status is preliminary research, not “X% false.” |
| Human review and correction | Users can inspect links and export reports | No authenticated reviewer queue, correction submission, adjudication or review audit trail. |
| Research evaluation | Mocked provider/control tests, multipart routing tests and real local FFmpeg tests where available | No labeled clip-matching benchmark, baseline study, contradiction-accuracy result or reviewer-time experiment. Passing tests is not measured fact-checking performance. |

## Hackathon demonstration boundary

The brief prioritizes an upload-first Vite/Express demonstration, FFmpeg sampling, supported Meta interpretation/claim comparison, a discovery provider or permitted corpus, and an inspectable evidence report. Those components exist in partial prototype form; access, configuration, provider budget state and returned evidence determine which report stages complete.

Use authorized **nonpolitical, non-war examples** for demonstrations, such as a sports clip or an animal-rescue repost with known context. This is a scope policy, not an automatic backend content filter. Do not claim that the repository has verified compliance with event-specific rules or submission terms.

The brief's broader visual sequence-matching engine, review workflow and at-viewing overlay remain outside the current implemented boundary. Search-provider swapping does not implement those capabilities.

## Interpreting evidence and scores

The active `rankMatched()` path in [evidenceRanking.js](../backend/services/evidenceRanking.js) combines website class (50%), chronology (30%) and textual relevance (20%). This is a transparent editorial heuristic. It is not independently calibrated source reliability, a provenance confidence measure or the probability that a claim is false. The older exported `scoreEvidence()` helper is not the active discovery-ranking path.

Publication date, post date, recording date and claimed event date are distinct. Earlier coverage can motivate review but does not by itself contradict a later post: archival footage can be correctly labeled as archival. Text comparisons can suggest contradiction, different context, consistency or uncertainty; the report must preserve quotations, source links and limits instead of declaring an automated verdict.

A credible source can still be wrong, and several sources may repeat the same report. The code does not verify source independence, resolve corrections across publishers or adjudicate disputed events. Model-assisted quote checks restrict outputs to retrieved excerpts; they do not make the excerpts true.

The C2PA/Content Credentials reference is a design influence, not a cryptographic-verification integration. Exact-byte fingerprints and inferred web coverage cannot substitute for validated signed manifests or media-version correspondence.

## Evaluation and research claims

The brief proposes comparison with **manual InVID-assisted verification** and a **text-only fact-check retrieval baseline**. These baselines are not integrated or evaluated in this repository. Planned measurements include:

- Clip-matching precision and recall, including crops, excerpts and near-duplicate scenes.
- Accuracy of contextual contradiction findings about date, event, location and identity.
- Abstention quality when evidence is missing, conflicting or ambiguous.
- Source coverage and the basis for earliest-located publication dates.
- Reviewer time and effort compared with the manual baseline.

A reproducible evaluation needs a permitted, labeled dataset, documented baseline procedures and separation of test cases from development examples. No measured speedup, matching accuracy, automated fact-checking accuracy, validated research novelty or market superiority is claimed. The contribution proposed in the brief is the tested integration of these capabilities; it remains to be demonstrated against baselines.

## Staged direction

1. **Demonstrable engine:** curated permitted clips, visual origin-match candidates and explicit claim-consistency checks with measurable ground truth.
2. **Professional workflow:** a versioned evidence API, human review/correction queue and persistent, inspectable evidence relationships.
3. **Cross-platform context reuse:** richer documented appearance histories and an accessible overlay that links to evidence without covering critical content.

These stages describe scope, not release dates or confirmed delivery commitments. Platform access, copyright, retention, privacy, third-party labeling, provider costs and relevant event/submission IP terms need review before broader distribution. No legal compliance or production readiness is established by this document.

See [operations](OPERATIONS.md) for current provider, spending and deployment constraints and the [application README](../README.md) for setup.
