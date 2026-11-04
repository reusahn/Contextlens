import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {canonicalUrl} from './urlContext.js';
export async function fileIdentity(path){
 const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);
 return {algorithm:'SHA-256',digest:hash.digest('hex'),qualification:'Identifies this exact file only; not proof of origin, authenticity or visual similarity.'};
}
export const ORIGIN_STATUSES=Object.freeze({unknown:'origin unknown',earliest:'earliest matching upload located',creator:'creator attribution supported',earlier:'earlier upload found'});
const evidenceUrl=value=>{try{return canonicalUrl(value);}catch{return '';}};
const supportedDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now();
// Input is server-side verified evidence, never search snippets or raw model claims.
// No public request parameter is allowed to assert these findings.
export function assessOrigin({inputUrl='',clipPublication=null,originEvidence={}}={}){
 const submitted=evidenceUrl(inputUrl);
 const matches=(Array.isArray(originEvidence.matchingUploads)?originEvidence.matchingUploads:[]).filter(m=>
  m&&evidenceUrl(m.url)&&supportedDate(m.uploadedAt)&&
  m.footageMatch?.status==='confirmed'&&['exact-file-sha256','reviewed-sequence-match'].includes(m.footageMatch.method)&&
  typeof m.footageMatch.verifiedBy==='string'&&m.footageMatch.verifiedBy.trim()&&evidenceUrl(m.footageMatch.evidenceUrl)&&
  (m.timestamp?.status==='verified'&&['platform-api','reviewed-post'].includes(m.timestamp.method)||m.timestamp?.status==='supported'&&m.timestamp.method==='page-video-upload')&&
  typeof m.timestamp.verifiedBy==='string'&&m.timestamp.verifiedBy.trim()&&evidenceUrl(m.timestamp.evidenceUrl)
 ).map(m=>({url:evidenceUrl(m.url),title:String(m.title||'Matching upload').slice(0,200),uploadedAt:new Date(m.uploadedAt).toISOString(),footageMatch:m.footageMatch,timestamp:m.timestamp}))
 .sort((a,b)=>Date.parse(a.uploadedAt)-Date.parse(b.uploadedAt));
 const byUrl=new Map();for(const m of matches)if(!byUrl.has(m.url))byUrl.set(m.url,m);
 const unique=[...byUrl.values()];
 const earliest=unique[0]||null;
 const submittedDate=supportedDate(clipPublication)?Date.parse(clipPublication):null;
 const earlier=unique.filter(m=>m.url!==submitted&&submittedDate!==null&&Date.parse(m.uploadedAt)<submittedDate);
 const matchedUrls=new Set(unique.map(m=>m.url));
 const attributions=(Array.isArray(originEvidence.creatorAttributions)?originEvidence.creatorAttributions:[]).filter(a=>
  a&&typeof a.creator==='string'&&a.creator.trim()&&typeof a.reviewedBy==='string'&&a.reviewedBy.trim()&&
  matchedUrls.has(evidenceUrl(a.uploadUrl))&&new Set((Array.isArray(a.evidenceUrls)?a.evidenceUrls:[]).map(evidenceUrl).filter(Boolean)).size>=2
 ).map(a=>({creator:a.creator.trim().slice(0,160),uploadUrl:evidenceUrl(a.uploadUrl),reviewedBy:a.reviewedBy.trim().slice(0,120),evidenceUrls:[...new Set(a.evidenceUrls.map(evidenceUrl).filter(Boolean))]}));
 const findings=[];
 if(earliest)findings.push({status:ORIGIN_STATUSES.earliest,reason:'Earliest supported upload among confirmed matching footage located in this investigation; not a globally first upload.',uploads:[earliest]});
 if(attributions.length)findings.push({status:ORIGIN_STATUSES.creator,reason:'Creator attribution has reviewed corroborating evidence linked to matching footage. This does not establish the first uploader.',attributions});
 if(earlier.length)findings.push({status:ORIGIN_STATUSES.earlier,reason:'A confirmed matching upload predates the supported publication time of the submitted post.',uploads:earlier});
 const status=earlier.length?ORIGIN_STATUSES.earlier:attributions.length?ORIGIN_STATUSES.creator:earliest?ORIGIN_STATUSES.earliest:ORIGIN_STATUSES.unknown;
 return {status,reason:findings.find(f=>f.status===status)?.reason||'No supported origin finding. Related articles and their publication dates do not identify the original uploader.',findings,matchingUploads:unique,earliestMatchingUpload:earliest,earlierUploads:earlier,creatorAttributions:attributions,qualification:'Findings are limited to reviewed evidence in this investigation. The first recording and globally first upload remain unproven.'};
}
export function buildLifeHistory({sources=[],inputUrl='',clipPublication=null,identity=null,claimComparisons=[],modificationReports=[],originEvidence={}}={}){
 const origin=assessOrigin({inputUrl,clipPublication,originEvidence});
 const nodes=sources.map((s,i)=>({id:`appearance-${i}`,url:s.url,title:s.title,date:s.publishedAt||null,dateStatus:s.dateStatus||'unconfirmed',kind:'related coverage',identityStatus:s.matchStatus||'textually related; same-footage identity unverified',relevance:s.relevance??null,claimExcerpt:(s.excerpt||'').slice(0,900)}));
 if(inputUrl)nodes.push({id:'submitted-post',url:inputUrl,title:'Submitted post',date:clipPublication,kind:'submitted post',identityStatus:'User supplied URL; relationship to retrieved reports unverified'});
 for(const [i,m] of origin.matchingUploads.entries()){
  const node=nodes.find(n=>evidenceUrl(n.url)===m.url);
  const fields={url:m.url,date:m.uploadedAt,dateStatus:m.timestamp.status==='verified'?'verified upload timestamp':'page-supported video upload date',identityStatus:`Confirmed footage match: ${m.footageMatch.method}`};
  if(node)Object.assign(node,fields,{kind:node.kind==='submitted post'?'submitted post':'matching upload'});
  else nodes.push({id:`matching-upload-${i}`,title:m.title,kind:'matching upload',...fields});
 }
 const dated=nodes.filter(n=>n.date&&Number.isFinite(Date.parse(n.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const undated=nodes.filter(n=>!dated.includes(n));
 const eligible=new Set(sources.map(s=>s.url));
 const claims=claimComparisons.filter(c=>eligible.has(c.earlierUrl)&&eligible.has(c.laterUrl));
 const modifications=modificationReports.filter(m=>eligible.has(m.url));
 return {
  title:'Life history of the footage',
  status:origin.matchingUploads.length?'confirmed matching uploads; related coverage remains separate':dated.length?'research reconstruction; footage identity unverified':'insufficient dated evidence',
  originalOrigin:origin,
  earliestLocated:dated.find(n=>n.kind==='related coverage')||null,
  identity,
  timeline:[...dated,...undated],
  edges:dated.slice(1).map((n,i)=>({from:dated[i].id,to:n.id,relationship:'chronological order only; copying or derivation not established'})),
  claimComparisons:claims,
  modificationHistory:{status:modifications.length?'source-reported modifications; independently unverified':'unestablished',reports:modifications,reason:'Frames and publication dates alone cannot establish cropping, editing, re-captioning or a chain of copies.'},
  cryptographicProvenance:{standard:'C2PA / Content Credentials',status:'not checked',reference:'https://contentauthenticity.org/how-it-works',qualification:'Inspired by the Content Authenticity Initiative provenance model. This report does not read or validate signed C2PA manifests. Search evidence and SHA-256 are not cryptographic edit-history verification.'},
  limitations:['Related articles may discuss the same event without depicting the submitted footage.','Sources can be incomplete, syndicated, misdated or unavailable.','Claim comparisons are model-assisted assessments of quoted excerpts, not factual verdicts.','A complete modification history requires earlier media versions or validated signed provenance, neither inferred from search dates.']
 };
}
