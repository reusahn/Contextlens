import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
export async function fileIdentity(path){
 const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);
 return {algorithm:'SHA-256',digest:hash.digest('hex'),qualification:'Identifies this exact file only; not proof of origin, authenticity or visual similarity.'};
}
export function buildLifeHistory({sources=[],inputUrl='',clipPublication=null,identity=null,claimComparisons=[],modificationReports=[]}={}){
 const nodes=sources.map((s,i)=>({id:`appearance-${i}`,url:s.url,title:s.title,date:s.publishedAt||null,dateStatus:s.dateStatus||'unconfirmed',kind:'related coverage',identityStatus:s.matchStatus||'textually related; same-footage identity unverified',relevance:s.relevance??null,claimExcerpt:(s.excerpt||'').slice(0,900)}));
 if(inputUrl)nodes.push({id:'submitted-post',url:inputUrl,title:'Submitted post',date:clipPublication,kind:'submitted post',identityStatus:'User supplied URL; relationship to retrieved reports unverified'});
 const dated=nodes.filter(n=>n.date&&Number.isFinite(Date.parse(n.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const undated=nodes.filter(n=>!dated.includes(n));
 const eligible=new Set(sources.map(s=>s.url));
 const claims=claimComparisons.filter(c=>eligible.has(c.earlierUrl)&&eligible.has(c.laterUrl));
 const modifications=modificationReports.filter(m=>eligible.has(m.url));
 return {
  title:'Life history of the footage',
  status:dated.length?'research reconstruction; footage identity unverified':'insufficient dated evidence',
  originalOrigin:{status:'unestablished',reason:'Earliest located coverage is not proof of the original recording or first upload.'},
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
