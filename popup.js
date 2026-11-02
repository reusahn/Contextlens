document.addEventListener('DOMContentLoaded', () => {
  const enabledEl = document.getElementById('enabled');
  const thresholdEl = document.getElementById('threshold');
  const statsEl = document.getElementById('stats');

  chrome.storage.local.get(['cl_settings', 'cl_fingerprints'], (res) => {
    const s = { enabled: true, threshold: 3, ...(res.cl_settings || {}) };
    enabledEl.checked = s.enabled;
    thresholdEl.value = s.threshold;
    const fps = res.cl_fingerprints || {};
    const scenes = Object.keys(fps).length;
    const total = Object.values(fps).reduce((a, f) => a + (f.count || 0), 0);
    statsEl.innerHTML = `<small>${scenes} distinct scenes seen · ${total} appearances counted</small>`;
  });

  // Preserve alwaysShow on save by merging with stored settings:
  const saveMerged = () => {
    chrome.storage.local.get(['cl_settings'], (res) => {
      const old = res.cl_settings || {};
      chrome.storage.local.set({ cl_settings: {
        ...old,
        enabled: enabledEl.checked,
        threshold: Math.max(1, Math.min(10, parseInt(thresholdEl.value, 10) || 3)),
      }});
    });
  };
  enabledEl.addEventListener('change', saveMerged);
  thresholdEl.addEventListener('change', saveMerged);
  document.getElementById('reset').onclick = () => {
    chrome.storage.local.set({ cl_fingerprints: {} });
    statsEl.innerHTML = '<small>Counts reset.</small>';
  };
});
