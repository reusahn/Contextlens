// Pure helpers, loaded by the background service worker and its Node tests.
const CL_TOPICS = Object.freeze([
  'Politics', 'Education', 'Commerce', 'Food', 'Advertising',
  'Fashion', 'Memes', 'Entertainment', 'Sports', 'Technology',
  'Science', 'Health', 'Travel', 'Gaming', 'Other'
]);
const CL_DEFAULTS = Object.freeze({
  enabled: true, threshold: 3, aiEnabled: false, shareFrame: false,
  bridgeUrl: 'http://127.0.0.1:8766', bridgeToken: '',
  originTraceUrl: 'http://localhost:5173/', alwaysShow: []
});

// One concrete viral identity is independent of its presentation as a tutorial,
// challenge, reaction or remix. Subject/format alone are NEVER a group key.
function clCanonicalIdentity(value) {
  let key=String(value||'').trim().toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
  if(!key)return '';
  // Small alias table for a well-known example; ALL other motifs use the same
  // general modifier-stripping rule, not a Slick Back-only classifier.
  if(/(^|-)(slick-?back|slip-?back|jubi-?slide)(-|$)/.test(key))return 'slick-back-glide';
  const modifiers=new Set(['tutorial','tutorials','challenge','challenges','trend','trends',
    'reaction','reactions','review','reviews','recap','unboxing','리뷰','후기','튜토리얼','챌린지','리믹스','영상','먹방','remix','remixed','remake','remakes','explained','explainer',
    'guide','guides','demo','demonstration','howto','how','to','steps','step',
    'edit','edits','edited','version','versions','repost','reposts','clip','clips','video','videos']);
  const banned=new Set(['dance','dancing','meme','memes','video','viral','trend','challenge',
    'sports','music','funny','people','comedy','food','politics','education',
    'fashion','technology','entertainment','other','tutorial','generic-dance','general-dance']);
  const parts=key.split('-').filter(Boolean);
  while(parts.length && modifiers.has(parts[0]))parts.shift();
  while(parts.length && modifiers.has(parts[parts.length-1]))parts.pop();
  key=parts.join('-');
  if(key.length<4 || key.length>72 || banned.has(key))return '';
  return key;
}

function clClampThreshold(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(2, Math.min(25, n)) : 3;
}
function clNormalizeAccount(value) {
  const account = String(value || '').replace(/^@/, '').trim().toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(account) ? account : '';
}
function clHamming(a, b) {
  let v = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), count = 0;
  while (v) { count++; v &= v - 1n; }
  return count;
}
function clCompareSamples(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return null;
  const matches = [];
  // Require two independent visual observations, in temporal order.
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      const x = left[i], y = right[j];
      if (!/^[0-9a-f]{16}$/.test(x?.hash || '') || !/^[0-9a-f]{16}$/.test(y?.hash || '')) continue;
      const d = clHamming(x.hash, y.hash);
      const signatures=Array.isArray(x.signature)&&Array.isArray(y.signature)&&x.signature.length===48&&y.signature.length===48;
      const colorDistance=signatures?x.signature.reduce((n,v,k)=>n+Math.abs(v-y.signature[k]),0)/48:0;
      if (d <= (signatures?5:3) && colorDistance<=18 && Math.abs((x.luma || 0) - (y.luma || 0)) <= 24) {
        matches.push({i, j, distance: d});
      }
    }
  }
  let best = null;
  for (const a of matches) for (const b of matches) {
    if (a.i >= b.i || a.j >= b.j) continue;
    if (left[a.i].hash === left[b.i].hash || right[a.j].hash === right[b.j].hash) continue;
    const score = a.distance + b.distance;
    if (!best || score < best.score) best = {score, matchedFrames: 2};
  }
  return best;
}
function clOfflineHint(caption = '') {
  const t = String(caption).toLowerCase();
  const rules = [
    ['Politics', /election|president|parliament|vote|senator|government|politic/],
    ['Education', /student|teacher|classroom|school|homework|university|lecture/],
    ['Commerce', /business|startup|stock market|store|salary|shopping|consumer/],
    ['Food', /food|recipe|chef|pasta|restaurant|bake|cooking|coffee/],
    ['Advertising', /sponsor|sale|discount|paid partnership|promo|advertis/],
    ['Fashion', /fashion|outfit|streetwear|runway|clothing|model|makeup/],
    ['Memes', /meme|pov:|when you|reaction|relatable|lol|😭|😂/],
    ['Entertainment', /movie|actor|film|celebrity|concert|music|tv show/],
    ['Sports', /football|soccer|basketball|tennis|goal|athlete|nba/],
    ['Technology', /ai |software|coding|robot|iphone|computer|technology/],
    ['Science', /lab|scientist|physics|space|experiment|research/],
    ['Health', /medical|doctor|hospital|exercise|fitness|health/],
    ['Travel', /airport|travel|vacation|city break|hotel|beach/],
    ['Gaming', /gaming|minecraft|fortnite|gameplay|streamer|esports/]
  ];
  const topic = rules.find(([,pattern]) => pattern.test(t))?.[0] || 'Other';
  return {
    topic,
    context: caption
      ? `This post frames the clip as: “${String(caption).slice(0, 130)}”. The footage's original situation has not been verified.`
      : 'The original situation behind this footage is not yet verified.',
    evidence: 'Caption-only hint · Not verified', provider: 'Local fallback'
  };
}
// Unicode and character bigrams retrieve multilingual aliases without a trend list.
// Retrieval scores only choose candidates; they never authorize a merge.
function clSearchTokens(value) {
  const text=String(value||'').normalize('NFKC').toLowerCase();
  const stop=new Set(['the','and','this','that','with','from','video','videos','clip','viral','trend','challenge','review','tutorial','food','dance','music','other']);
  const words=(text.match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>=2&&!stop.has(t));
  const result=new Set(words);
  for(const word of words)if(/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)) {
    for(let i=0;i<word.length-1;i++)result.add(word.slice(i,i+2));
  }
  return result;
}
function clDescriptorText(value) {
  return [value?.viralKey,value?.keyword,value?.label,value?.action,value?.visualEvidence,value?.semanticDescription,value?.ocrText,
    ...(value?.aliases||[]),...(value?.entities||[]),...(value?.distinctiveCues||[]),...(value?.priorCaptions||[])].filter(v=>typeof v==='string').join(' ');
}
function clRankCandidates(observation,candidates,limit=8) {
  const query=clSearchTokens(clDescriptorText(observation));
  const docs=candidates.filter(x=>x&&typeof x.id==='string').map((value,index)=>({value,index,tokens:clSearchTokens(clDescriptorText(value))}));
  const df=new Map();for(const doc of docs)for(const t of doc.tokens)df.set(t,(df.get(t)||0)+1);
  const ranked=docs.map(doc=>{
    let score=0;for(const token of query)if(doc.tokens.has(token))score+=Math.log(1+(docs.length+1)/((df.get(token)||0)+1));
    if(observation?.audioId&&observation.audioId===doc.value.audioId)score+=2;
    if(observation?.identityScope&&observation.identityScope===doc.value.identityScope)score+=.3;
    return {...doc,score};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  const count=Math.max(1,Math.min(12,limit)),primary=ranked.slice(0,Math.max(1,count-2));
  const remaining=ranked.filter(x=>!primary.includes(x));
  for(const item of [...remaining.filter(x=>x.value.topic===observation?.topic),...remaining])if(primary.length<count&&!primary.includes(item))primary.push(item);
  return primary.map(x=>({...x.value,retrievalScore:Number(x.score.toFixed(3))}));
}
if (typeof module !== 'undefined') module.exports = {CL_TOPICS, CL_DEFAULTS, clClampThreshold, clNormalizeAccount, clHamming, clCompareSamples, clOfflineHint, clCanonicalIdentity,clSearchTokens,clDescriptorText,clRankCandidates};
