/* ContextLens v0.1 — Instagram web extension.
 *
 * What it does, and what it does NOT claim:
 * - Samples frames from <video> elements already on instagram.com (the
 *   frame-probe step verified getImageData works for blob: videos there).
 * - Builds a small average-hash (aHash, 8x8) fingerprint from up to 5 frames
 *   sampled ~1s apart, using the centre 80% of the frame to be a little more
 *   robust to top/bottom caption bars and aspect-ratio changes.
 * - Matches a new video to a stored fingerprint when any sampled hash is
 *   within Hamming distance <= 8 (of 64 bits). Borderline matches are NOT
 *   folded: they only get a count badge, per the "uncertain = visible" rule.
 * - Folds (blurs + overlay) only when count >= threshold (default 3) and
 *   the match is confident. The viewer can always reopen, or always-show
 *   that scene.
 * - Everything is local: chrome.storage.local only. No data is sent anywhere,
 *   and nothing on Instagram's servers is changed — only this browser's
 *   display.
 *
 * Known limits (state these honestly in a demo):
 * - aHash is NOT robust to heavy crops, mirroring, large speed changes, or
 *   heavy overlays. It is a v0.1 prototype, not a production deduplicator.
 * - A single frame is weak evidence; that is why we require a close match
 *   and never fold on a first, uncertain, or uniform (blank/black) frame.
 * - Instagram's DOM changes often; container detection falls back to the
 *   video's parent when no <article> is found.
 */

(() => {
  const MATCH_MAX_DISTANCE = 8;
  const MAX_SAMPLES = 5;
  const SAMPLE_INTERVAL_MS = 1000;

  let settings = { enabled: true, threshold: 3, alwaysShow: [] };
  let fingerprints = {}; // id -> { hashes: [bigint-string], count, lastSeen }
  let saveTimer = null;

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({ cl_fingerprints: fingerprints, cl_settings: settings });
    }, 300);
  }

  function hamming(a, b) {
    let x = a ^ b, n = 0;
    while (x) { n += Number(x & 1n); x >>= 1n; }
    return n;
  }

  function hashToBigInt(bits) {
    return BigInt('0b' + bits);
  }

  function sampleHash(video) {
    if (video.readyState < 2 || !video.videoWidth) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 8; canvas.height = 8;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // Centre 80% crop: helps a little with caption bars / aspect changes.
      const sw = video.videoWidth * 0.8, sh = video.videoHeight * 0.8;
      ctx.drawImage(video,
        video.videoWidth * 0.1, video.videoHeight * 0.1, sw, sh,
        0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      const grey = [];
      for (let i = 0; i < data.length; i += 4) {
        grey.push((data[i] + data[i + 1] + data[i + 2]) / 3);
      }
      const avg = grey.reduce((a, b) => a + b, 0) / grey.length;
      const bits = grey.map((v) => (v >= avg ? '1' : '0')).join('');
      if (bits === '0'.repeat(64) || bits === '1'.repeat(64)) return null; // blank frame
      return bits;
    } catch {
      return null; // tainted canvas etc. -> no match, no fold
    }
  }

  function findMatch(hashes) {
    let best = null;
    for (const [id, fp] of Object.entries(fingerprints)) {
      for (const h of hashes) {
        for (const stored of fp.hashes) {
          const d = hamming(hashToBigInt(h), hashToBigInt(stored));
          if (!best || d < best.distance) best = { id, distance: d };
        }
      }
    }
    return best && best.distance <= MATCH_MAX_DISTANCE ? best : null;
  }

  function containerFor(video) {
    const el = video.closest('article') || video.parentElement?.parentElement || video.parentElement;
    if (el && getComputedStyle(el).position === 'static') el.style.position = 'relative';
    return el;
  }

  function render(video) {
    const fpId = video.dataset.clFingerprint;
    if (!fpId || !fingerprints[fpId]) return;
    const fp = fingerprints[fpId];
    const container = containerFor(video);
    if (!container) return;

    let badge = container.querySelector(':scope > .cl-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'cl-badge';
      container.appendChild(badge);
    }
    badge.textContent = `ContextLens ×${fp.count}`;

    const shouldFold = settings.enabled && fp.count >= settings.threshold
      && !settings.alwaysShow.includes(fpId) && video.dataset.clUnfolded !== '1';
    let fold = container.querySelector(':scope > .cl-fold');
    if (shouldFold) {
      video.classList.add('cl-blurred');
      if (!fold) {
        fold = document.createElement('div');
        fold.className = 'cl-fold';
        fold.innerHTML = `<div>This scene appeared ${fp.count} times</div>` +
          `<small>Folded by ContextLens after ${settings.threshold} appearances. You can reopen it.</small>`;
        const showBtn = document.createElement('button');
        showBtn.textContent = 'Show anyway';
        showBtn.onclick = (e) => { e.stopPropagation(); video.dataset.clUnfolded = '1'; render(video); };
        const alwaysBtn = document.createElement('button');
        alwaysBtn.className = 'cl-secondary';
        alwaysBtn.textContent = 'Always show this scene';
        alwaysBtn.onclick = (e) => {
          e.stopPropagation();
          if (!settings.alwaysShow.includes(fpId)) settings.alwaysShow.push(fpId);
          scheduleSave(); render(video);
        };
        fold.append(showBtn, alwaysBtn);
        container.appendChild(fold);
      } else {
        fold.querySelector('div').textContent = `This scene appeared ${fp.count} times`;
      }
    } else {
      video.classList.remove('cl-blurred');
      fold?.remove();
    }
  }

  function processVideo(video) {
    if (video.dataset.clProcessed) return;
    video.dataset.clProcessed = '1';
    const hashes = [];
    let attempts = 0;

    const trySample = () => {
      if (attempts >= MAX_SAMPLES) {
        // Paused videos repeat the same frame, so hashes may never reach 3
        // distinct values — still register the scene after max attempts.
        if (hashes.length >= 1 && !video.dataset.clFingerprint) {
          const id = hashes[0];
          fingerprints[id] = { hashes: [...hashes], count: 1, lastSeen: Date.now() };
          video.dataset.clFingerprint = id;
          scheduleSave(); render(video);
        }
        return;
      }
      attempts++;
      const h = sampleHash(video);
      if (h && !hashes.includes(h)) hashes.push(h);

      if (hashes.length >= 1) {
        const match = findMatch(hashes);
        if (match) {
          const fp = fingerprints[match.id];
          fp.count += 1;
          fp.lastSeen = Date.now();
          for (const hh of hashes) if (!fp.hashes.includes(hh)) fp.hashes.push(hh);
          fp.hashes = fp.hashes.slice(-10);
          video.dataset.clFingerprint = match.id;
          scheduleSave(); render(video);
          return; // matched: stop sampling this element
        }
      }
      if (hashes.length >= 3) {
        // No confident match after 3 distinct frames: new scene, count = 1.
        const id = hashes[0];
        fingerprints[id] = { hashes: [...hashes], count: 1, lastSeen: Date.now() };
        video.dataset.clFingerprint = id;
        scheduleSave(); render(video);
        return;
      }
      setTimeout(trySample, SAMPLE_INTERVAL_MS);
    };
    // First attempt now (paused videos still have a frame, per the probe),
    // then again as it plays.
    trySample();
    video.addEventListener('playing', () => { if (!video.dataset.clFingerprint) setTimeout(trySample, SAMPLE_INTERVAL_MS); }, { once: false });
  }

  function scan(root = document) {
    if (!settings.enabled) return;
    root.querySelectorAll('video').forEach(processVideo);
  }

  function refreshAll() {
    document.querySelectorAll('video').forEach((v) => {
      if (v.dataset.clFingerprint) render(v);
      else processVideo(v);
    });
  }

  chrome.storage.local.get(['cl_fingerprints', 'cl_settings'], (res) => {
    fingerprints = res.cl_fingerprints || {};
    settings = { ...settings, ...(res.cl_settings || {}) };
    scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.cl_settings) settings = { ...settings, ...changes.cl_settings.newValue };
    if (changes.cl_fingerprints) fingerprints = changes.cl_fingerprints.newValue || {};
    if (!settings.enabled) {
      document.querySelectorAll('.cl-badge, .cl-fold').forEach((el) => el.remove());
      document.querySelectorAll('video.cl-blurred').forEach((v) => v.classList.remove('cl-blurred'));
    } else {
      refreshAll();
    }
  });

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'VIDEO') processVideo(node);
        else node.querySelectorAll?.('video').forEach(processVideo);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
