import { compareCaptions, prepareLocalModel } from './hybrid.bundle.js';

const setupTabId = (await chrome.tabs.getCurrent())?.id;
const prepare = document.getElementById('prepare');
prepare.addEventListener('click', async () => {
  const result = document.getElementById('result');
  prepare.disabled = true;
  result.textContent = 'Preparing the model…';
  try {
    await prepareLocalModel();
    result.textContent = 'Firebase AI Logic ran on this device.';
  } catch (error) {
    result.textContent = error.message;
  } finally {
    prepare.disabled = false;
  }
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'CL_HYBRID_COMPARE' || message.tabId !== setupTabId ||
      sender.id !== chrome.runtime.id || sender.tab ||
      (sender.url && sender.url !== chrome.runtime.getURL('background.js'))) return false;
  compareCaptions(message.caption, message.candidates, message.allowCloud)
    .then(result => reply({ ok: true, ...result }))
    .catch(() => reply({ ok: false }));
  return true;
});
