import {spawnSync} from 'node:child_process';
export function runtimeCapabilities(){
 const available=(command,args)=>{try{const r=spawnSync(command,args,{stdio:'ignore',timeout:5000});return !r.error&&r.status===0;}catch{return false;}};
 return {ffmpeg:available(process.env.FFMPEG_COMMAND||'ffmpeg',['-version']),platformExtractor:available(process.env.YTDLP_COMMAND||'yt-dlp',['--version']),speechProvider:process.env.SPEECH_PROVIDER||(process.env.LOCAL_WHISPER_ENABLED==='true'?'local':'meta')};
}
