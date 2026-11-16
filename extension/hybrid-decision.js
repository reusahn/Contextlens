function clCaptionCandidates(library) {
  return Object.entries(library)
    .filter(([, scene]) => scene.captionReference)
    .sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 8)
    .map(([id, scene]) => ({ id, caption: scene.captionReference }));
}

function clCaptionDecision(result, caption, candidates, allowCloud) {
  const source = result?.source;
  if (source !== 'on_device' && !(allowCloud && source === 'in_cloud')) return null;
  let value;
  try {
    value = JSON.parse(String(result.text).trim().replace(/^```(?:json)?\s*|\s*```$/gi, ''));
  } catch {
    return { source, status: 'uncertain' };
  }
  const normalized = text => String(text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const excerpt = (text, cue) => typeof cue === 'string' && normalized(cue).length >= 4 &&
    normalized(text).includes(normalized(cue));
  const label = typeof value?.label === 'string' ? value.label.trim().slice(0, 85) : '';
  if (label && excerpt(caption, value.currentCue)) {
    if (value.status === 'distinct' && !value.candidateId) return { status: 'distinct', label, source };
    if (value.status === 'matched') {
      const prior = candidates.find(candidate => candidate.id === value.candidateId);
      if (prior && excerpt(prior.caption, value.priorCue)) {
        return { status: 'matched', id: prior.id, label, source };
      }
    }
  }
  return { source, status: 'uncertain' };
}

function clInferenceLabel(source) {
  return source === 'on_device' ? 'On device' : source === 'in_cloud' ? 'Cloud' : '';
}

if (typeof module !== 'undefined') module.exports = { clCaptionCandidates, clCaptionDecision, clInferenceLabel };
