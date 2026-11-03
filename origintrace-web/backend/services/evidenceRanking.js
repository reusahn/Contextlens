import {clueWords} from './searchClues.js';
import {canonicalUrl} from './urlContext.js';
/** Transparent editorial heuristic, NOT a factual trustworthiness measure. */
const established = new Set(['reuters.com','apnews.com','bbc.com','npr.org','pbs.org']);
const reference = new Set(['wikipedia.org','britannica.com']);
function domainOf(url){try {return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
export function domainWeight(url){
  const domain=domainOf(url);
  if(!domain) return {weight:0.3,reason:'Unknown source domain'};
  if(domain.endsWith('.gov')||domain.endsWith('.edu')) return {weight:0.9,reason:'Government or educational domain (verify relevance independently)'};
  if(established.has(domain)) return {weight:0.85,reason:'Established editorial newsroom (heuristic)'};
  if(reference.has(domain)) return {weight:0.7,reason:'General reference source'};
  return {weight:0.5,reason:'Unclassified domain; credibility requires manual checking'};
}
export function scoreEvidence(source,firstDate){
 const {weight,reason}=domainWeight(source.url);
 const publication=source.publishedAt?Date.parse(source.publishedAt):NaN;
 const earliest=firstDate?Date.parse(firstDate):NaN;
 const chronological=Number.isFinite(publication)&&Number.isFinite(earliest)?Math.max(0,1-Math.abs(publication-earliest)/(1000*60*60*24*365)):0.45;
 const corroboration=source.corroboration??0;
 const total=Math.round(100*(0.5*weight+0.3*chronological+0.2*corroboration));
 return {...source,domain:domainOf(source.url),score:total,weightFactors:{domain:weight,chronology:chronological,corroboration},scoreExplanation:reason};
}
export function earliestDated(sources){
 const dated=sources.filter(s=>s.publishedAt&&!Number.isNaN(Date.parse(s.publishedAt)));
 return [...dated].sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt))[0]||null;
}

export function verifiedDate(candidates,now=Date.now()){
 const valid=candidates.map(x=>({...x,time:typeof x.value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(x.value)?Date.parse(x.value):NaN})).filter(x=>Number.isFinite(x.time)&&x.time>=0&&x.time<=now&&new Date(x.time).toISOString().slice(0,10)===x.value.slice(0,10));
 if(!valid.length)return {publishedAt:null,dateStatus:'missing or invalid',dateEvidence:candidates};
 const days=new Set(valid.map(x=>new Date(x.time).toISOString().slice(0,10)));
 if(days.size>1)return {publishedAt:null,dateStatus:'conflicting dates',dateEvidence:candidates};
 const page=valid.find(x=>x.source.startsWith('page:'));
 return {publishedAt:page?new Date(page.time).toISOString():null,dateStatus:page?'page-supported publication date':'search date unconfirmed',dateEvidence:candidates};
}
const words=s=>new Set(clueWords(s));
export function matchArticle(source,terms,inputUrl){
 const text=`${source.title} ${source.articleText||source.excerpt||''}`.toLowerCase();
 const tokens=words(text);
 const groups=terms.map(t=>[...words(t)]).filter(x=>x.length>=2);
 const coverages=groups.map(group=>({group,hits:group.filter(w=>tokens.has(w)).length}));
 const matched=coverages.filter(({group,hits})=>hits>=2&&hits/group.length>=0.6);
 const strongest=matched.length?Math.max(...matched.map(({group,hits})=>hits/group.length)):0;
 const direct=Boolean(inputUrl&&(text.includes(inputUrl.toLowerCase())||(source.links||[]).some(link=>{try{return canonicalUrl(link)===canonicalUrl(inputUrl);}catch{return false;}})));
 return {relevance:direct?1:strongest,matchedClues:matched.map(({group})=>group.join(' ')),matchStatus:direct?'references submitted URL':matched.length?'textually related; same-clip identity unverified':'no sufficient textual match'};
}
export function rankMatched(sources){
 const matched=sources.filter(s=>s.relevance>=0.25);
 const earliest=earliestDated(matched);
 return {earliest,sources:matched.map(s=>{
  const domain=domainWeight(s.url),chronology=s.publishedAt&&earliest?1/(1+Math.max(0,Date.parse(s.publishedAt)-Date.parse(earliest.publishedAt))/(86400000*365)):0;
  const score=Math.round(100*(0.5*domain.weight+0.3*chronology+0.2*s.relevance));
  return {...s,domain:domainOf(s.url),score,weightFactors:{domain:domain.weight,chronology,relevance:s.relevance},scoreExplanation:`${domain.reason}; weighted average: website 50%, chronology 30%, textual relevance 20%. This is not a truth probability.`};
 }).sort((a,b)=>b.score-a.score)};
}

export function comparePublication(articleDate,clipDate){
 const article=Date.parse(articleDate),clip=Date.parse(clipDate);
 if(!Number.isFinite(article)||!Number.isFinite(clip))return {daysRelativeToClip:null,timestampComparison:'Cannot compare: article or post publication date is unconfirmed.'};
 const days=(article-clip)/86400000;
 return {daysRelativeToClip:Math.round(days*100)/100,timestampComparison:days<0?`Published ${Math.abs(days).toFixed(1)} days before the submitted post.`:days>0?`Published ${days.toFixed(1)} days after the submitted post.`:'Same reported publication time as the submitted post.'};
}
