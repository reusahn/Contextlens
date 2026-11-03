// Local, bounded text extraction. Phrases are candidate clues, not verified entities.
const stop=new Set('the and for that this with from have has had was were are you your they their them there here just very really please like share follow subscribe instagram video reel footage watch today yesterday tomorrow said says about into onto over under after before when where what which who why how our out but not all can could would should will been being more some these those its also one now'.split(' '));
export function clueWords(text){return [...new Set((String(text).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)||[]).filter(w=>w.length>=3&&!stop.has(w)))];}
export function extractClues({caption='',transcript='',terms=[]}={}){
 const result=[],seen=new Set();
 function add(text,type){
  const value=String(text).replace(/https?:\/\/\S+/g,' ').replace(/[#@]/g,'').replace(/\s+/g,' ').trim().slice(0,180);
  const words=clueWords(value);const key=words.join(' ');
  if(words.length<2||seen.has(key)||result.length>=24)return;
  seen.add(key);result.push({text:value,type});
 }
 const text=`${caption.slice(0,4000)}\n${transcript.slice(0,12000)}`;
 for(const m of text.matchAll(/[“"]([^”"\n]{8,180})[”"]/g))add(m[1],'quotation');
 for(const term of terms.slice(0,12))add(term,'visual');
 // Multiword capitalized spans can include names/places; do not claim entity recognition.
 for(const m of text.matchAll(/\b(?:[A-Z][\p{L}'’-]+(?:\s+|$)){2,4}/gu))add(m[0],'name/place phrase');
 const sentences=text.replace(/https?:\/\/\S+/g,' ').split(/[.!?;\n]+/);
 // Take one short fragment per sentence before taking further fragments of long sentences.
 const fragments=sentences.map(s=>clueWords(s));
 for(let offset=0;offset<24;offset+=6){
  for(const words of fragments){if(words.length>offset)add(words.slice(offset,offset+6).join(' '),'text fragment');}
 }
 return result;
}
