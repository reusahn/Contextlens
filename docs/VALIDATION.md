# Validation for this revision

| Check | Result | Scope |
| --- | --- | --- |
| Node regression suite | 40 passed, 0 failed | Parsing, retrieval, conservative verification, account counting, failure handling, URLs, HTTP bridge, caching, metrics and persisted budget |
| Syntax and manifest | Passed, 23 JavaScript files | Active bridge/extension/feed/tools/tests and content-script presence |
| Real Meta provider contract smoke | 4 checks passed, 6 inference attempts | Synthetic product images, same-product verification, same-brand/different-product rejection, inline MP4 input |
| Additional real Meta connection smoke | Passed, 1 attempt | Three synthetic moving-shape images returned insufficient identity |
| Chromium DOM regression | Not run successfully in this environment | Browser download returned non-archive data; cloud browser could not reach the local test server and its URL policy disallowed a data-URL fixture |
| Logged-in Instagram overlay behaviour | Not verified | No live-session claim is made |
| Real Instagram precision, recall, false blur or latency improvement | Not measured | No labelled real-video dataset was supplied |
| Collaborator OriginTrace | Unchanged | Its full suite could not run here because npm dependencies were unavailable; do not infer full-project validation from ContextLens tests |

The uploaded baseline's core suite had two stale mocked-response fixtures: they omitted fields required by the then-current parser. These were updated to provide explicit visual grounding and the new independent verification contract, while retaining low-confidence and unrelated-identity rejection assertions. New tests cover exact-key collisions, product conflicts, shared-audio bypass removal, old Korean-alias retrieval among 500 groups, cache spending, quota errors and restart persistence.

Model-mocked tests assert software behaviour. They do not measure the model's recognition performance. The real provider smoke uses computer-drawn synthetic products with readable labels. It confirms request/response paths and a controlled positive/negative decision; it does not establish performance on unfamiliar phenomena, motion, speech, real people, compressed uploads, diverse cameras or Instagram layouts. See `PROVIDER_SMOKE.json`.

## Reproduce

`npm run check` and `npm test` need Node.js, without npm dependencies. `node tools/provider-smoke.cjs --run` explicitly enables actual Meta requests. Use one process per local budget ledger.

`npm run test:browser` needs separately installed Playwright and Chromium. It uses the production overlay and content scripts with a stubbed Chrome API and stubbed recognition. It checks actual pointer isolation, investigation dispatch, keyboard reveal after scrolling and playback. It remains narrower than a real extension on Instagram.

For live Instagram, check Show video, new-tab investigation, underlying likes/play controls, keyboard Enter/Space, narrow windows, scrolling, reused Reel nodes and navigation while a classification is pending. Ensure distinct account counts persist across unrelated clips and that missing/blocked frames remain visible. Do not mark this list passed until it is observed.

For accuracy, run the same labelled manifest through `baseline`, `frames` and `video` modes. The comparison is a semantic-path benchmark, not a browser benchmark. Report denominators, uncertainty, unclassified clips, errors, latency and requests; do not claim 100% from a small test.
