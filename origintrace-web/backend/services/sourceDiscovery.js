import {searchMeta} from './metaSearch.js';
import {extractClues} from './searchClues.js';
import {compareWithMeta} from './metaComparison.js';
import {rankMatched,verifiedDate,matchArticle} from './evidenceRanking.js';
import {fetchPublic,parsePage,webUrl,canonicalUrl,usableContext,plain} from './urlContext.js';
export function buildQueries({url='',caption='',transcript='',terms=[]}={}){
 const queries=[];
 if(url)queries.push(canonicalUrl(url));
 const clues=extractClues({caption,transcript,terms});
 for(const clue of clues)queries.push(clue.type==='quotation'?`"${clue.text}"`:clue.text);
 return [...new Set(queries.map(s=>String(s).replace(/\s+/g,' ').trim().slice(0,300)).filter(Boolean))].slice(0,6);
}
async function mapLimited(items,limit,fn){
 const out=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i]);}}));return out;
}
export async function searchEvidence(terms,context={}, {fetchImpl=globalThis.fetch,pageFetcher=fetchPublic}={}){
 const provider=process.env.SEARCH_PROVIDER?.trim()||'meta';
 if(!['meta','tavily'].includes(provider)||provider==='meta'&&process.env.META_SEARCH_BILLING_MODE!=='best_effort')return {sources:[],earliest:null,queries:[],diagnostics:{status:'blocked',provider,queriesAttempted:0,queriesFailed:0,candidates:0,matched:0},warning:provider==='meta'?'Meta hosted web search is blocked by the spending guard: the documented API caps tool calls but not billed queries per call. Configure SEARCH_PROVIDER=tavily and TAVILY_API_KEY for retrieval; Meta can compare retrieved article text using the existing $100 ledger.':'Unknown SEARCH_PROVIDER. Use meta or tavily.'};
 const key=(provider==='meta'?process.env.META_API_KEY:process.env.TAVILY_API_KEY)?.trim();
 const diagnostics={provider,status:key?'pending':'disabled',queriesAttempted:0,queriesFailed:0,candidates:0,matched:0};
 if(!key)return {sources:[],earliest:null,queries:[],diagnostics,warning:`Evidence search is disabled: configure ${provider==='meta'?'META_API_KEY':'TAVILY_API_KEY'} in the backend .env and restart the server.`};
 const queries=buildQueries({...context,terms});
 if(!queries.length)return {sources:[],earliest:null,queries,diagnostics:{...diagnostics,status:'no clues'},warning:'No identifiable search terms were extracted.'};
 const collected=new Map(),issues=new Set(),queryLog=[];let indexedCaption='';
 if(provider==='meta')issues.add('Meta hosted search uses best-effort estimated query accounting. Its charges are not covered by a strict worst-case $100 guarantee.');
 const submitted=context.url?canonicalUrl(context.url):'';
 async function search(query,endDate=null){
  queryLog.push({query,endDate,kind:endDate?'historical date-filtered search':'general search'});
  diagnostics.queriesAttempted++;
  try{
   let data;
   if(provider==='meta'){
    const result=await searchMeta(endDate?`${query} published before ${endDate}`:query,context.user||'anonymous',{fetchImpl});
    data={results:result.results};if(result.warning)issues.add(result.warning);
   }else{
   const response=await fetchImpl('https://api.tavily.com/search',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key,query,search_depth:'advanced',max_results:8,include_answer:false,include_raw_content:true,...(endDate?{end_date:endDate}:{})})});
   if(!response.ok){issues.add(response.status===401||response.status===403?'Search credentials were rejected.':response.status===429?'Search provider quota or rate limit reached.':`Search provider returned HTTP ${response.status}.`);throw Error();}
   data=await response.json();
   }
   for(const x of data.results||[]){try{
    const url=webUrl(x.url);
    if(submitted&&canonicalUrl(url)===submitted){
     const candidate={url,title:String(x.title||''),caption:plain(x.content||'').slice(0,1500)};
     if(!indexedCaption&&candidate.caption&&usableContext(candidate))indexedCaption=candidate.caption;
     continue;
    }
    if(!collected.has(url))collected.set(url,{title:String(x.title||'Untitled source'),url,excerpt:String(x.content||'').slice(0,2000),articleText:String(x.raw_content||'').slice(0,24000),searchDate:x.published_date||null});
   }catch{}}
  }catch(error){diagnostics.queriesFailed++;if(provider==='meta'&&error.name==='MetaControlError')issues.add(error.message);}
 }
 // The exact-URL search can recover indexed context when a platform blocks page retrieval.
 if(provider==='meta'){queries.splice(0,queries.length,`${queries.slice(0,4).join(' ; ').slice(0,320)} historical and current third-party coverage${context.clipPublishedAt?` before and after ${context.clipPublishedAt.slice(0,10)}`:''}`);}
 await search(queries[0]);
 if(provider!=='meta'&&indexedCaption&&!context.caption){
  const expanded=buildQueries({...context,caption:indexedCaption,terms});
  queries.splice(0,queries.length,...[...new Set([...queries,...expanded])].slice(0,6));
 }
 const baseQueries=context.reconstructHistory?queries.slice(0,4):queries;
 await mapLimited(baseQueries.slice(1),2,query=>search(query));
 if(context.reconstructHistory&&provider!=='meta'){
  const relevantQuery=baseQueries.find(q=>!/^https?:/.test(q));
  if(relevantQuery){
   for(let i=0;i<2;i++){
    const hinted=[context.clipPublishedAt,...[...collected.values()].map(s=>s.searchDate)].map(d=>Date.parse(d)).filter(t=>Number.isFinite(t)&&t>86400000&&t<=Date.now());
    const anchor=hinted.length?Math.min(...hinted):Date.UTC(new Date().getUTCFullYear()-i,0,1);
    let before=new Date(anchor).toISOString().slice(0,10);
    if(queryLog.some(q=>q.endDate===before))before=new Date(anchor-366*86400000).toISOString().slice(0,10);
    await search(relevantQuery,before);
   }
  }
  queries.splice(0,queries.length,...queryLog.map(q=>q.endDate?`${q.query} [before ${q.endDate}]`:q.query));
 }

 const extractedClues=extractClues({terms,caption:context.caption||indexedCaption,transcript:context.transcript||''});
 const clues=extractedClues.map(c=>c.text);
 diagnostics.candidates=collected.size;diagnostics.clues=extractedClues.length;
 const scored=[...collected.values()].map(s=>({...s,...matchArticle(s,clues,context.url)})).sort((a,b)=>b.relevance-a.relevance);
 const dateHints=scored.filter(s=>s.relevance>=0.25&&Number.isFinite(Date.parse(s.searchDate))).sort((a,b)=>Date.parse(a.searchDate)-Date.parse(b.searchDate));
 const selected=context.reconstructHistory?[...scored.slice(0,6),...dateHints.slice(0,3),...dateHints.slice(-3).reverse(),...scored]:scored;
 const candidates=[...new Map(selected.map(s=>[s.url,s])).values()].slice(0,12);
 const verified=await mapLimited(candidates,3,async s=>{
  const dates=s.searchDate?[{value:s.searchDate,source:'search:published_date'}]:[];
  let retrievalStatus=s.articleText?'search-provider content':'snippet only';
  try{
   const r=await pageFetcher(s.url);if(!/html/i.test(r.type))throw Error();
   const page=parsePage(r.bytes.toString(),r.url);if(!usableContext(page))throw Error();
   s.articleText=page.text;s.title=page.title||s.title;s.links=page.links;
   dates.push(...page.dates);retrievalStatus='page retrieved';
  }catch{}
  return {...s,...verifiedDate(dates),...matchArticle(s,clues,context.url),retrievalStatus,excerpt:(s.articleText||s.excerpt).slice(0,2000),retrievedAt:new Date().toISOString()};
 });
 let comparisonWarning='',claimComparisons=[],modificationReports=[];
 if(process.env.META_TEXT_COMPARISON!=='false'&&process.env.META_API_KEY?.trim()&&verified.length){
  try{
   const comparison=await compareWithMeta(verified,{...context,terms},context.user||'anonymous');
   for(const item of comparison.comparisons)verified[Number(item.id)].metaComparison={assessment:item.assessment,reason:item.reason};
   comparisonWarning=comparison.warning;claimComparisons=comparison.claimComparisons||[];modificationReports=comparison.modificationReports||[];
  }catch{comparisonWarning='Meta text comparison unavailable or blocked by budget/rate controls; deterministic evidence ranking remains available.';}
 }
 // AI assessments are displayed separately; never promote a generated assertion to a verified fact or date.
 const ranked=rankMatched(verified);
 diagnostics.matched=ranked.sources.length;diagnostics.checked=verified.length;diagnostics.rejected=verified.length-ranked.sources.length;diagnostics.unchecked=Math.max(0,collected.size-verified.length);
 diagnostics.status=diagnostics.queriesFailed===diagnostics.queriesAttempted?'failed':diagnostics.queriesFailed?'partial':'completed';
 return {...ranked,billingQualification:provider==='meta'?'Meta search uses best-effort estimated query accounting; the strict $100 guarantee does not apply to hosted-search charges.':null,claimComparisons,modificationReports,queryLog,queries,diagnostics,indexedCaption,extractedClues,warning:[comparisonWarning,...issues,diagnostics.queriesFailed?`${diagnostics.queriesFailed} search queries failed.`:'',!clues.length?'No clip-specific text was available; only articles referencing the submitted URL can be matched. Paste a caption/transcript or upload the clip.':'',ranked.earliest?'Earliest page-supported publication date among textually matched results; not a verified first upload.':'No matching source has an uncontested page-supported publication date.','Text matching does not verify that reports show the same clip. Syndicated copies are not independent confirmation.'].filter(Boolean).join(' ')};
}
