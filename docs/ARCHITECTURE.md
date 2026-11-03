# Architecture

The Chrome content script captures up to eight timestamped JPEGs only while a clip is visible. A Shadow DOM portal and manual popover hold interactive UI outside Instagram's component tree. The video remains a platform-owned node; only its blur class and playback are controlled.

The service worker retains `cl_settings_v2` and `cl_library_v2`. It serializes registration, normalizes distinct account identities and first checks approximate ordered footage fingerprints with a coarse colour check. Groups use persistent UUIDs; spelling normalization never authorizes group merging.

For a different-looking clip, the worker calls `/api/describe`. The bridge invokes Muse Spark 1.3 without any candidate list to extract an observation. `/api/match` then retrieves eight candidates from up to 500 stored descriptors and independently verifies identity, using current and cached reference frames when available. Separate requests keep each fetch under the extension worker's response deadline. Each model phase has a 24-second total timeout and at most one malformed-completion retry.

A merge requires a provided candidate ID, specific visual evidence, a permitted basis, two distinct shared cues, no conflicts and a heuristic confidence of at least .84. A name, category, audio ID or format cannot bypass this check. Uncertain or unavailable model results do not create misleading singleton groups. The viewer may reveal a blurred post immediately.

The bridge keeps 32 observations in RAM for an hour, including up to two reference JPEGs per observation. Chrome stores fingerprints, descriptions, account/post evidence and counters, not JPEGs. The API key remains in the local bridge environment. The local call ledger is persisted atomically, resets on UTC date rollover, and counts each actual inference attempt. Run one bridge per ledger; it is not a provider billing control.

`/api/viral` remains a composed compatibility API. `/api/baseline` runs the archived v0.9 inference path for explicit comparison. The benchmark can submit user-provided MP4 files inline after local bounded transcoding; Instagram integration continues to use images and metadata. Audio recognition and SAM are not added by this revision.

OriginTrace remains a separate collaborator project. The extension opens a new tab with the current URL/caption. That navigation is not evidence of original provenance.
