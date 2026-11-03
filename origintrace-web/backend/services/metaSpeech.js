import {getMetaBudget,MetaControlError,AUDIO_LIMIT_SECONDS} from './metaBudget.js';
// Accept only bounded PCM WAVs, so reservation does not trust caller duration metadata.
export function wavDuration(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<44||bytes.length>6*1024*1024||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt32LE(4)!==bytes.length-8)throw Error('Invalid bounded WAV');
 let format=null,data=null;
 for(let offset=12;offset+8<=bytes.length;){
  const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
  if(start+size>bytes.length)throw Error('Truncated WAV');
  if(type==='fmt '){if(format||size<16)throw Error('Invalid WAV format');format={pcm:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),byteRate:bytes.readUInt32LE(start+8),align:bytes.readUInt16LE(start+12),bits:bytes.readUInt16LE(start+14)};}
  if(type==='data'){if(data!==null)throw Error('Duplicate WAV data');data=size;}
  offset=start+size+(size%2);
 }
 if(!format||data===null||format.pcm!==1||format.channels!==1||format.bits!==16||![16000,24000].includes(format.rate)||format.byteRate!==format.rate*2||format.align!==2||data%2||!data)throw Error('Unsupported WAV');
 const seconds=data/format.byteRate;if(seconds>AUDIO_LIMIT_SECONDS)throw Error('Audio duration exceeds limit');return seconds;
}
export async function transcribeMeta(bytes,user,{budget=getMetaBudget(),fetchImpl=globalThis.fetch}={}){
 wavDuration(bytes);
 const key=process.env.META_API_KEY?.trim();if(!key)throw new MetaControlError('Meta speech requires META_API_KEY');
 const form=new FormData();form.append('request',new Blob([JSON.stringify({model:'muse-voice-transcribe-1.0',audioEncoding:'WAV',mode:'PUSH_TO_TALK'})],{type:'application/json'}));form.append('audio',new Blob([bytes],{type:'audio/wav'}),'clip.wav');
 const id=budget.reserve(user,'audio');
 try{
  const response=await fetchImpl('https://api.meta.ai/v1/asr/transcribe',{method:'POST',headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},body:form,signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new MetaControlError(`Meta speech returned HTTP ${response.status}`);
  const data=await response.json();budget.reconcile(id,{audioDurationMs:data.audioDurationMs});
  if(typeof data.transcript!=='string')throw Error();
  budget.completeKnownTerminal(id);
  return {text:data.transcript.slice(0,12000),source:'Meta speech transcription',warning:'Speech covers at most the first 180 seconds; recognition may contain errors.'};
 }catch(e){if(e instanceof MetaControlError)throw e;throw new MetaControlError('Meta speech failed; uncertain reservation retained');}
}
