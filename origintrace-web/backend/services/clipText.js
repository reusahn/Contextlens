import {transcribeMeta} from './metaSpeech.js';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
function execute(command,args){return new Promise((resolve,reject)=>{
 const p=spawn(command,args,{stdio:'ignore',timeout:180000});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error('Local transcription unavailable')));
});}
export async function transcribeClip(path,user='anonymous',{run=execute,meta=transcribeMeta}={}){
 const provider=process.env.SPEECH_PROVIDER||(process.env.LOCAL_WHISPER_ENABLED==='true'?'local':'meta');
 if(!['meta','local'].includes(provider))return {text:'',warning:'Local speech transcription is disabled; captions and supplied transcript are still used.'};
 const dir=await mkdtemp(join(tmpdir(),'origintrace-speech-'));
 try{
  const audio=join(dir,'audio.wav');
  await run(process.env.FFMPEG_COMMAND||'ffmpeg',['-nostdin','-protocol_whitelist','file,pipe,data','-y','-i',path,'-t','180','-vn','-ar','16000','-ac','1','-c:a','pcm_s16le',audio]);
  if(provider==='meta')return await meta(await readFile(audio),user);
  await run(process.env.WHISPER_COMMAND||'whisper',[audio,'--model','base','--output_format','txt','--output_dir',dir,'--fp16','False']);
  return {text:(await readFile(join(dir,'audio.txt'),'utf8')).slice(0,12000),warning:'Speech transcription covers at most the first 180 seconds and may contain errors.'};
 }catch(error){return {text:'',source:provider,warning:error.code==='ENOENT'?'Audio extraction unavailable: install FFmpeg and ensure it is on the backend PATH.':error.name==='MetaControlError'?error.message:'Speech extraction failed: check FFmpeg, audio availability, provider configuration and budget controls.'};}
 finally{await rm(dir,{recursive:true,force:true});}
}
