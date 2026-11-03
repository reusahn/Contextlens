import {spawn} from 'node:child_process';
import {canonicalUrl,webUrl,plain} from './urlContext.js';
export function instagramPost(value){
 const u=new URL(canonicalUrl(value));
 return u.hostname==='www.instagram.com'&&/^\/(?:reel|p|tv)\/[A-Za-z0-9_-]+\/$/.test(u.pathname)?u.href:null;
}
export function platformInfo(data,url){
 if(data._type==='playlist'||data.entries)throw Error('Single post required');
 const videos=[data,...(data.formats||[])].filter(f=>typeof f.url==='string'&&(!f.protocol||/^https?$/.test(f.protocol))&&f.vcodec!=='none'&&f.acodec!=='none');
 const video=videos.find(f=>f.ext==='mp4')||videos[0];
 const subtitles=Object.values(data.subtitles||{}).flat().filter(s=>s.ext==='vtt'&&typeof s.url==='string').slice(0,2);
 const timestamp=Number.isFinite(data.timestamp)?new Date(data.timestamp*1000).toISOString():null;
 return {url,title:plain(data.title||''),caption:plain(data.description||'').slice(0,4000),video:video?webUrl(video.url):null,tracks:subtitles.map(s=>webUrl(s.url)),transcript:'',dates:timestamp?[{value:timestamp,source:'platform:reported upload timestamp'}]:[],origin:'public platform extractor'};
}
export async function extractPlatform(value,{execute=runExtractor}={}){
 const url=instagramPost(value);if(!url)return null;
 if(process.env.PLATFORM_EXTRACTION_ENABLED==='false')throw Error('Public platform extraction disabled');
 return platformInfo(await execute(url),url);
}
function runExtractor(url){return new Promise((resolve,reject)=>{
 // Only fixed Instagram post routes; no generic extractor, cookies, credentials, config or downloads.
 const child=spawn(process.env.YTDLP_COMMAND||'yt-dlp',['--ignore-config','--no-cache-dir','--no-playlist','--skip-download','--dump-single-json','--use-extractors','Instagram$','--socket-timeout','10','--retries','0','--extractor-retries','0','--',url],{stdio:['ignore','pipe','ignore'],timeout:45000});
 let output='',size=0;
 child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){child.kill('SIGKILL');reject(Error('Platform metadata too large'));}else output+=chunk;});
 child.on('error',e=>reject(Error(e.code==='ENOENT'?'Install yt-dlp for public Instagram video/caption extraction.':'Public platform extraction failed.')));
 child.on('close',code=>{if(code!==0)return reject(Error('Public platform extraction unavailable; upload the clip or paste its caption.'));try{resolve(JSON.parse(output));}catch{reject(Error('Invalid public platform metadata'));}});
});}
