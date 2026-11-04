import {spawn} from 'node:child_process';
import {canonicalUrl,webUrl,plain} from './urlContext.js';
export function instagramPost(value){
 const u=new URL(canonicalUrl(value));
 return u.hostname==='www.instagram.com'&&/^\/(?:reel|p|tv)\/[A-Za-z0-9_-]+\/$/.test(u.pathname)?u.href:null;
}
export function platformInfo(data,url){
 if(data._type==='playlist'||data.entries)throw Error('Single post required');
 const videos=[data,...(data.formats||[])].filter(f=>typeof f.url==='string'&&(!f.protocol||/^https?$/.test(f.protocol))&&f.vcodec!=='none');
 const video=videos.find(f=>f.ext==='mp4'&&f.acodec&&f.acodec!=='none')||videos.find(f=>f.ext==='mp4')||videos[0];
 const subtitles=Object.values(data.subtitles||{}).flat().filter(s=>s.ext==='vtt'&&typeof s.url==='string').slice(0,2);
 const timestamp=Number.isFinite(data.timestamp)?new Date(data.timestamp*1000).toISOString():null;
 return {url,title:plain(data.title||''),caption:plain(data.description||'').slice(0,4000),video:video?webUrl(video.url):null,tracks:subtitles.map(s=>webUrl(s.url)),transcript:'',dates:timestamp?[{value:timestamp,source:'platform:reported upload timestamp'}]:[],origin:'public platform extractor'};
}
export async function extractPlatform(value,{execute=runExtractor}={}){
 const url=instagramPost(value);if(!url)return null;
 if(process.env.PLATFORM_EXTRACTION_ENABLED==='false')throw Error('Public platform extraction disabled');
 return platformInfo(await execute(url),url);
}
export function extractorArgs(url){
 if(!instagramPost(url))throw Error('Single Instagram post required');
 const browser=process.env.INSTAGRAM_COOKIES_BROWSER?.trim();
 if(browser&&!/^chrome(?::[^\r\n]+)?$/.test(browser))throw Error('INSTAGRAM_COOKIES_BROWSER must be chrome or chrome:PROFILE');
 return ['--ignore-config','--no-cache-dir','--no-playlist','--skip-download','--dump-single-json','--use-extractors','Instagram$','--socket-timeout','10','--retries','0','--extractor-retries','0',...(browser?['--cookies-from-browser',browser]:[]),'--',instagramPost(url)];
}
export function extractionFailure(stderr){
 if(/decrypt|keychain|find-generic-password failed|cookie database|could not copy.*cookie|failed to load cookies/i.test(stderr))return 'Chrome session could not be read. Check the Chrome profile and any macOS Keychain permission prompt, then retry.';
 if(/not.*available.*everyone|certain audiences|login required|log.?in|cookies|private|restricted/i.test(stderr))return 'Instagram restricted this post. Sign into an account that can view it in the configured Chrome profile, then retry.';
 if(/429|rate.limit|too many requests/i.test(stderr))return 'Instagram rate-limited extraction. Wait before retrying.';
 if(/resolve host|timed out|network|connection/i.test(stderr))return 'Instagram extraction failed because of a network or timeout error.';
 return 'Instagram video extraction failed. Check that the post plays in the configured Chrome profile and update yt-dlp if needed.';
}
function runExtractor(url){return new Promise((resolve,reject)=>{
 // Metadata only, fixed Instagram post routes. Browser-session use is explicit local opt-in.
 const child=spawn(process.env.YTDLP_COMMAND||'yt-dlp',extractorArgs(url),{stdio:['ignore','pipe','pipe'],timeout:45000});
 let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8192);});
 let output='',size=0;
 child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){child.kill('SIGKILL');reject(Error('Platform metadata too large'));}else output+=chunk;});
 child.on('error',e=>{const error=Error(e.code==='ENOENT'?'Install yt-dlp for public Instagram video/caption extraction.':'Public platform extraction failed.');error.code=e.code;reject(error);});
 child.on('close',code=>{if(code!==0){const error=Error(extractionFailure(stderr));error.code='INSTAGRAM_EXTRACTION_FAILED';return reject(error);}try{resolve(JSON.parse(output));}catch{reject(Error('Invalid public platform metadata'));}});
});}
