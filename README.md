# ContextLens — Instagram web extension (v0.1)

Less repetition. More control.

This is the first real extension build, after the frame probe verified
`getImageData` works for `blob:` videos on instagram.com (see
`../contextlens-frame-probe/`). It is still a prototype, not a production
deduplicator.

## What it does

- Samples up to 5 frames per video, ~1 second apart, from the centre 80%
  of the frame.
- Builds an 8×8 average-hash (aHash) fingerprint per video.
- Matches a new video when any sampled hash is within Hamming distance
  ≤ 8 of 64 bits to a stored fingerprint. Uncertain matches are NOT folded
  — they only get a count badge.
- Shows a `ContextLens ×N` badge on every matched video.
- At the threshold (default 3, configurable in the popup), blurs the video
  and shows an overlay: "This scene appeared N times", with
  **Show anyway** (this post only) and **Always show this scene**.
- All matching and counts are local (`chrome.storage.local`). Nothing is
  sent anywhere, and Instagram's servers/recommendations are untouched —
  only this browser's display changes.

## Load it (same as the probe)

1. Download all files in this folder into one folder on your computer:
   `manifest.json`, `content.js`, `content.css`, `popup.html`, `popup.js`.
   (A single file alone will not load — Chrome needs the whole folder,
   and `manifest.json` is what tells Chrome it is an extension.)
2. `chrome://extensions` → Developer mode → **Load unpacked** → select
   that folder.
3. Open instagram.com, scroll through Reels / video posts.
4. Open the extension popup to change the threshold, disable it, or reset
   counts. After testing, remove it from `chrome://extensions` if you
   do not want it running.

## How to test it honestly

- Watch the same Reel twice in different places, then a third time:
  the third appearance should fold at the default threshold.
- Try a cropped / captioned re-edit of the same clip: it may or may not
  match — aHash is weak against heavy crops, mirroring, speed changes,
  and heavy overlays. Record that as a miss, don't tune the threshold
  to hide it.
- Try an unrelated clip with a similar first frame (e.g. a plain sky):
  blank/uniform frames are skipped, but similar simple scenes can still
  collide. That is why uncertain matches are badge-only in principle —
  in v0.1 the distance threshold is the only guard, so check false folds.

## Known limits

- aHash, not a production video fingerprint. No audio fingerprint, no
  scene-change segmentation, no crop/mirror-invariant embedding yet.
- Instagram's DOM changes often; if badges stop appearing, the container
  detection (`article` → parent fallback) is the first place to check.
- Counts are per-browser, per-profile. They do not sync, and clearing
  extension storage resets them.
- The Muse Spark caption/commentary comparison from the proposal is
  still planned, not implemented in this extension.
