import { cloudConfigured, compareCaptions, firebaseConfigured, prepareLocalModel } from './hybrid.bundle.js';

const byId = id => document.getElementById(id);
const video = byId('clip');
const configured = firebaseConfigured();
const fallbackPage = location.pathname.endsWith('/fallback.html');
const library = {};
const results = new Map();
const revealed = new Set();
let sources = [];
let selected = 0;
let busy = false;

const settings = () => ({ countUnit: byId('unit').value, threshold: Number(byId('limit').value) });
const unitLabel = count => `${settings().countUnit.slice(0, count === 1 ? -1 : undefined)}`;

function play() {
  if (sources[selected]) video.play().catch(() => {});
}

function render() {
  const post = CL_HYBRID_POSTS[selected];
  const result = results.get(selected);
  const scene = library[result?.id];
  const count = scene ? clSceneCount(scene, settings()) : 0;
  const limit = settings().threshold;
  const paused = Boolean(scene && count >= limit && !revealed.has(selected));
  byId('post-by').textContent = `@${post.account}`;
  byId('post-index').textContent = `Post ${selected + 1} of ${CL_HYBRID_POSTS.length}`;
  byId('caption').textContent = post.caption;
  byId('analyze').disabled = !configured || busy || Boolean(result);
  byId('previous').disabled = busy || selected === 0;
  byId('next').disabled = busy || selected === CL_HYBRID_POSTS.length - 1;
  byId('reset').disabled = busy || !results.size;
  byId('prepare').disabled = fallbackPage || !configured || busy;
  byId('cloud').disabled = !cloudConfigured() || busy;
  video.classList.toggle('blurred', paused);
  byId('pause-card').hidden = !paused;
  byId('pause-count').textContent = scene ? `${scene.concept.label} · ${count}/${limit} ${settings().countUnit}` : '';
  if (paused) video.pause();

  if (result) {
    const route = clInferenceLabel(result.source);
    byId('comparison').textContent = scene ?
      `${route} · ${scene.concept.label} · ${count} unique ${unitLabel(count)}` :
      `${route} · Caption lacks identifying details. Count unchanged.`;
  }

  const history = byId('history');
  history.replaceChildren();
  const scenes = Object.values(library);
  if (!scenes.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Compare a caption to start tracking.';
    history.append(empty);
  }
  for (const group of scenes) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    const tally = document.createElement('strong');
    label.textContent = group.concept.label;
    tally.textContent = `${clSceneCount(group, settings())}/${limit}`;
    row.append(label, tally);
    history.append(row);
  }
}

function show(index) {
  selected = index;
  video.pause();
  if (sources[index]) video.src = sources[index];
  byId('comparison').textContent = '';
  render();
  if (byId('pause-card').hidden) play();
}

async function analyze() {
  if (busy || results.has(selected) || !configured) return;
  busy = true;
  const post = CL_HYBRID_POSTS[selected];
  const allowCloud = byId('cloud').checked;
  const candidates = clCaptionCandidates(library);
  byId('comparison').textContent = 'Comparing the caption…';
  render();
  try {
    const response = await compareCaptions(post.caption, candidates, allowCloud);
    const decision = clCaptionDecision(response, post.caption, candidates, allowCloud);
    if (!decision) throw new Error('Firebase could not confirm the permitted inference route.');
    if (decision.status === 'uncertain') {
      results.set(selected, { source:decision.source });
      return;
    }
    const id = decision.id || crypto.randomUUID();
    const scene = library[id] || {};
    clApplyCaptionDecision(scene, decision, post.caption);
    clAddScenePost(scene, post.account, `https://www.instagram.com/reel/fictional-hybrid-${selected}/`, post.caption);
    scene.updatedAt = Date.now();
    library[id] = scene;
    results.set(selected, { id, source:decision.source });
  } catch (error) {
    byId('comparison').textContent = 'Comparison unavailable. ' + String(error.message).slice(0, 180);
  } finally {
    busy = false;
    render();
  }
}

byId('analyze').addEventListener('click', analyze);
byId('previous').addEventListener('click', () => show(selected - 1));
byId('next').addEventListener('click', () => show(selected + 1));
byId('reveal').addEventListener('click', () => {
  revealed.add(selected);
  render();
  play();
});
byId('reset').addEventListener('click', () => {
  for (const id of Object.keys(library)) delete library[id];
  results.clear();
  revealed.clear();
  show(0);
});
for (const id of ['unit', 'limit']) byId(id).addEventListener('change', () => {
  render();
  if (byId('pause-card').hidden) play();
});
byId('prepare').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  render();
  const availability = byId('availability');
  availability.textContent = 'Preparing the local model…';
  try {
    await prepareLocalModel(fraction => {
      availability.textContent = fraction < 1 ?
        `Downloading the local model · ${Math.round(fraction * 100)}%` : 'Checking on-device inference…';
    });
    availability.textContent = 'Firebase confirmed on-device inference.';
  } catch (error) {
    availability.textContent = error.message;
  } finally {
    busy = false;
    render();
  }
});

if (fallbackPage) {
  byId('route-test').textContent = 'Return to local AI';
  byId('route-test').href = './';
}
byId('availability').textContent = !configured ? 'This preview needs Firebase configuration to compare captions.' :
  fallbackPage ? 'This test page blocks access to Chrome’s local model.' :
    'Prepare Chrome’s local model, then compare the captions.';
render();
Promise.all(CL_HYBRID_POSTS.map(post => createVideo(post.scene))).then(clips => {
  sources = clips;
  byId('media-status').hidden = true;
  video.src = sources[selected];
  if (byId('pause-card').hidden) play();
}).catch(() => {
  byId('media-status').textContent = 'This browser could not render the sample clips.';
});
