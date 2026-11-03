# ContextLens 1.0

**Fewer repeats. More context. Your choice.**

ContextLens is a Chrome Manifest V3 extension that helps a viewer control repeated exposure to a **specific phenomenon** across different posting accounts. Different recordings, tutorials and reviews can share a count when evidence supports the same precise target. At the viewer's chosen N, the clip pauses and blurs. The viewer can reveal it or open the separate OriginTrace investigation project.

Counts describe distinct accounts observed in this browser. They are not platform-wide popularity or posting totals. A match is an estimate, not verified provenance.

[한국어 설치·업데이트 안내](README_KO.md) · [Validation](docs/VALIDATION.md) · [A/B judging review](docs/JUDGING_REVIEW_KO.md) · [Three-minute demo](docs/DEMO_EN.md)

## Start

Requires Node.js 22.13 or newer. The extension and bridge have no npm dependencies.

1. Keep your existing `bridge/.env`. For a new installation, copy `bridge/.env.example` to `bridge/.env` and enter your own Meta key.
2. From this directory, run `npm run bridge`. Copy the printed **pairing token** into the extension popup.
3. At `chrome://extensions`, enable Developer mode and load `extension/`. Turn on AI recognition and frame sharing if you want semantic matching.

**Updating an installed extension:** copy the new extension files into the existing extension directory and click its **Reload** button. Keep the same extension ID to retain Chrome storage. Keep the old `bridge/.env`; never replace it with a blank example. New uploads of this package omit keys.

`npm run feed` serves `http://127.0.0.1:8765/`. Open `/real.html` there to play your own local clips with editable account/caption fields. The synthetic feed is a UI fixture, not a recognition benchmark. OriginTrace remains a separate project in `origintrace-web/`; use its README to start it, then set its URL in the popup.

## What changed

| Area | Uploaded prototype | This revision |
| --- | --- | --- |
| Visual input | At most 3 images, 240×240; could start with 2 | Up to 8 timestamped frames, aspect ratio preserved, 512px long edge |
| Evidence collection | Could inspect off-screen clips | Capture only while visible; finish a partially observed clip after scrolling |
| Recognition | One prompt identifies and chooses a group | Observe without candidates, retrieve using the observation, independently verify identity |
| Retrieval | Caption/recent history, first 35 groups | All stored descriptors, up to 500; Unicode terms, Korean bigrams, OCR, aliases, actions and audio metadata; rerank to 8 candidates |
| Merge policy | A shared key or audio-title path could bypass verification | UUID-based groups; no automatic key/audio merge; two distinct shared cues and no contradictions required |
| UI | Card inside the platform's stacking context | Shadow DOM portal outside the platform tree, manual top-layer popover, native button semantics |
| API guard | 200 configured became 100; restart reset usage | 200 is accepted, each attempt counted, ledger survives restarts, UTC rollover |
| Evaluation | Synthetic feed and model mocks | Labelled local-video comparison tool, regression tests, separately labelled real-provider contract checks |

There is **no measured improvement percentage on real Instagram clips yet**. Better input and more careful grouping can trade latency and recall for fewer false merges. Measure these tradeoffs with the benchmark before making accuracy claims.

## Recognition

Local perceptual hashes and coarse colour layout first look for matching footage. This is an approximate filter, not Meta vPDQ and not proof of identity. For a visually different clip, opt-in Meta Muse Spark 1.3:

1. Extracts a specific target, identity scope, observed action, objects/entities, OCR, bilingual aliases, distinctive cues and uncertainty, without seeing candidates.
2. Uses those descriptors to search all stored groups. Retrieval is weighted text matching over model-produced descriptors, not a vector embedding model.
3. Independently verifies up to eight candidates. Current frames and available prior reference frames support the decision. Contradictory or uncertain candidates do not increase counts.

Subject, format and identity are separate. The 15 existing subjects remain. No named trend is hardcoded in the active model prompts. A legacy Slick Back spelling alias remains only for stored-key compatibility. A model confidence threshold is a heuristic, not a calibrated probability.

The Instagram extension sends **sampled images and post metadata**, not downloaded video or extracted audio. The local benchmark also supports user-provided MP4 clips. Spark 1.3 audio understanding is limited; this revision makes no claim of soundtrack recognition, full-video Instagram analysis, automatic original-source discovery, SAM segmentation or ASR integration.

The bridge keeps up to 32 recent observations and reference images in memory for one hour; restarting clears them. Chrome retains group descriptors, fingerprints, counts and account/post evidence, not JPEGs or keys. Old UUIDs and account counts are preserved; groups are not merged merely because their names agree.

## Checks

```bash
npm run check
npm test
node tools/provider-smoke.cjs --run
```

The last command uses your Meta key for about six real inference attempts on **synthetic product fixtures**. Stop the bridge before running that standalone smoke command so only one process uses its local usage ledger. It does not estimate real-world recognition accuracy. See `docs/PROVIDER_SMOKE.json` for the recorded result from this revision.

For the optional Chromium DOM regression:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
```

Alternatively run `node tools/browser-fixture.cjs` and open its printed URL in Chrome. Its recognition and counts are stubbed; it checks pointer, keyboard, stacking and scrolling behaviour. Live Instagram verification is still necessary.

## Real-video benchmark

Requires local `ffmpeg` and `ffprobe`, your labelled video files, and a running bridge. See `benchmarks/manifest.example.json`. Put a stable pairing token in `CL_BRIDGE_TOKEN` in your local `.env`, or set `CL_BENCH_TOKEN` to the running bridge's token.

```bash
# No API calls: validate paths and labels.
node tools/evaluate.cjs --manifest /path/to/manifest.json --mode frames
# Explicit --run enables paid requests through the bridge's daily guard.
node tools/evaluate.cjs --manifest /path/to/manifest.json --mode baseline --run
node tools/evaluate.cjs --manifest /path/to/manifest.json --mode frames --run
node tools/evaluate.cjs --manifest /path/to/manifest.json --mode video --run
```

Use the same ordered manifest for each run. Ground-truth group IDs are never sent to the model. Reports include pairwise precision/recall, false blur and missed repetition rates, unclassified rate, p50/p95 analysis latency and actual Meta attempts. Unknown pricing is left blank. This evaluates the semantic path; it is not a full browser or source-verification benchmark. Baseline is the uploaded v0.9 inference engine, retained in `benchmarks/baseline-v09.cjs`.

`DAILY_META_LIMIT=200` means 200 **attempts**, not 200 videos. An unseen specific clip often needs one observation; comparison with an existing library normally adds a verification attempt. Malformed completions may add one bounded retry per phase. The local guard is not a provider billing limit. Use one running bridge per ledger.

## Submission

Use `docs/SUBMISSION_EN.md`, `docs/DEMO_EN.md`, and `docs/JUDGING_REVIEW_KO.md`. They distinguish completed engineering from pending real-data evidence. Do not describe the synthetic API checks as Instagram accuracy, web search results as the first original upload, or a target rubric as an awarded score.

Before publishing a repository, exclude `.env`, pairing tokens, usage ledgers, node_modules, private uploads and private benchmark results. The supplied package omits credentials. Read the collaborator's licensing and attribution requirements before publishing their OriginTrace code.

## Primary technical references

- [Meta image understanding](https://dev.meta.ai/docs/image-understanding)
- [Meta video understanding and Spark 1.3 audio limitations](https://dev.meta.ai/docs/video-understanding)
- [Meta inline file handling](https://dev.meta.ai/docs/file-handling)
- [Meta media segmentation: SAM produces geometry, not phenomenon identity](https://dev.meta.ai/docs/media-segmentation)
- [Chrome extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Manual popovers](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API)
