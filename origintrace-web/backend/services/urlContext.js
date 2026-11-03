import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

export function publicAddress(ip){
 if(isIP(ip)===6)return /^[23][0-9a-f]{3}:/i.test(ip)&&!/^2001:(?:0*:|db8:)/i.test(ip);
 if(isIP(ip)!==4)return false;
 const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export function webUrl(value,base){
 const u=new URL(value,base);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error('Unsupported public URL');
 u.hash='';return u.href;
}
// Resolve and pin a public address per redirect, preventing DNS rebinding and SSRF.
export async function fetchPublic(value,{maxBytes=2*1024*1024,redirects=4}={}){
 const url=new URL(webUrl(value));
 const hostname=url.hostname.replace(/^\[|\]$/g,'');
 const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await lookup(hostname,{all:true});
 if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw Error('URL does not resolve to public internet');
 const address=addresses.find(x=>x.family===4)||addresses[0];
 const result=await new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?https:http).get(url,{
   headers:{'User-Agent':'OriginTrace/0.2 (source research)','Accept':'text/html,video/*,text/vtt,application/json'},
   lookup:(_host,options,cb)=>options.all?cb(null,[address]):cb(null,address.address,address.family),
  },res=>{
   if(res.statusCode>=300&&res.statusCode<400){res.resume();return resolve({redirect:res.headers.location});}
   if(res.statusCode!==200){res.resume();return reject(Error(`Page unavailable (HTTP ${res.statusCode})`));}
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)res.destroy(Error('Remote content exceeds size limit'));else chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>resolve({url:url.href,type:String(res.headers['content-type']||''),bytes:Buffer.concat(chunks)}));
  });
  const timer=setTimeout(()=>req.destroy(Error('Remote request timed out')),15000);
  req.on('close',()=>clearTimeout(timer));req.on('error',reject);
 });
 if(result.redirect){if(!redirects)throw Error('Too many redirects');return fetchPublic(webUrl(result.redirect,url),{maxBytes,redirects:redirects-1});}
 return result;
}
export const decode=s=>String(s||'').replace(/&(?:amp|quot|apos|lt|gt|#39|#\d+|#x[0-9a-f]+);/gi,x=>{
 const known={'&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&lt;':'<','&gt;':'>'};
 if(known[x.toLowerCase()])return known[x.toLowerCase()];
 const code=x[2]?.toLowerCase()==='x'?parseInt(x.slice(3,-1),16):Number(x.slice(2,-1));
 return code>0&&code<=0x10ffff?String.fromCodePoint(code):x;
});
export function canonicalUrl(value){
 const u=new URL(webUrl(value));
 if(/^(www\.)?instagram\.com$/i.test(u.hostname)&&/^\/(?:p|reel|reels|tv)\/[^/]+/.test(u.pathname)){
  u.hostname='www.instagram.com';u.pathname=u.pathname.replace(/^\/reels\//,'/reel/').replace(/\/embed.*$/,'').replace(/\/?$/,'/');u.search='';
 }
 return u.href;
}
function attributes(tag){
 const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[m[1].toLowerCase()]=decode(m[2]??m[3]);return attrs;
}
export function usableContext(context){
 const title=String(context.title||'').trim(),caption=String(context.caption||'').trim();
 if(/\/(?:accounts\/login|challenge|consent)(?:\/|\?)/i.test(context.url||''))return false;
 const generic=/^(?:instagram|login|log in|log in to instagram|instagram photos and videos|sign up)(?:[ .|–—-].*)?$/i;
 return Boolean(caption&&!/^(?:create an account|join instagram|log in|sign up|welcome back)/i.test(caption)||title&&!generic.test(title));
}
export const plain=s=>decode(String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
function safeMedia(value,url){try{return value?webUrl(decode(value),url):null;}catch{return null;}}
export function embeddedInstagram(html,url){
 const u=new URL(url),code=/^\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(u.pathname)?.[1];
 if(!/(^|\.)instagram\.com$/.test(u.hostname)||!code)return null;
 let found=null,visited=0;
 function walk(v,depth=0){
  if(found||depth>20||++visited>20000||!v||typeof v!=='object')return;
  if(v.shortcode===code||v.code===code){
   const caption=typeof v.caption==='string'?v.caption:v.caption?.text||v.edge_media_to_caption?.edges?.[0]?.node?.text||'';
   const video=v.video_url||v.video_versions?.find(x=>typeof x.url==='string')?.url;
   found={caption:typeof caption==='string'?caption:'',video:safeMedia(video,url),dates:typeof v.taken_at_timestamp==='number'&&Number.isFinite(v.taken_at_timestamp)&&v.taken_at_timestamp>0&&v.taken_at_timestamp<=Date.now()/1000?[{value:new Date(v.taken_at_timestamp*1000).toISOString(),source:'platform:embedded post timestamp'}]:[]};return;
  }
  for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,depth+1);
 }
 for(const block of html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(block[1]));}catch{}}
 return found;
}
export function parsePage(html,url){
 const meta={};
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
  const attrs=attributes(tag);
  const key=attrs.property||attrs.name||attrs.itemprop;if(key&&attrs.content)meta[key.toLowerCase()]=attrs.content;
 }
 const dates=[];let structuredCaption='',structuredVideo='';
 for(const key of ['article:published_time','datepublished','date','pubdate'])if(meta[key])dates.push({value:meta[key],source:`page:${key}`});
 for(const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const walk=(v,depth=0)=>{if(depth>10||!v||typeof v!=='object')return;if(v['@type']==='VideoObject'){structuredCaption=typeof v.description==='string'?v.description:structuredCaption;structuredVideo=typeof v.contentUrl==='string'?v.contentUrl:structuredVideo;}if(v.datePublished)dates.push({value:v.datePublished,source:'page:datePublished'});for(const x of Object.values(v))if(typeof x==='object')walk(x,depth+1);};walk(JSON.parse(block[1]));}catch{}
 }
 const embedded=embeddedInstagram(html,url);if(embedded?.dates)dates.push(...embedded.dates);
 const video=embedded?.video||structuredVideo||meta['og:video:secure_url']||meta['og:video:url']||meta['og:video']||html.match(/<(?:video|source)\b[^>]*src=["']([^"']+)["']/i)?.[1];
 const tracks=[...html.matchAll(/<track\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
 return {url,title:plain(meta['og:title']||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),caption:plain(embedded?.caption||structuredCaption||meta['og:description']||meta.description||''),text:plain(html).slice(0,24000),links:[...html.matchAll(/<(?:a|iframe)\b[^>]*>/gi)].map(m=>attributes(m[0])).map(a=>a.href||a.src).filter(Boolean).slice(0,100).flatMap(link=>{try{return [webUrl(link,url)];}catch{return [];}}),dates,video:safeMedia(video,url),tracks:tracks.slice(0,2).flatMap(x=>{const link=safeMedia(x,url);return link?[link]:[];})};
}
export async function retrieveContext(url,{fetcher=fetchPublic}={}){
 const response=await fetcher(canonicalUrl(url));
 if(!/html/i.test(response.type))throw Error('URL is not an accessible HTML page');
 const context=parsePage(response.bytes.toString('utf8'),response.url);
 if(!usableContext(context))throw Error('Page contains a login screen or no clip-specific metadata');
 context.transcript='';
 for(const track of context.tracks){try{const r=await fetcher(track,{maxBytes:256*1024});context.transcript+=' '+plain(r.bytes.toString().replace(/WEBVTT|\d\d:\d\d[^\n]*/g,''));}catch{}}
 return context;
}
