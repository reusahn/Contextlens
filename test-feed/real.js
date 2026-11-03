const grid=document.getElementById('grid');let urls=[];
document.getElementById('files').addEventListener('change',event=>{
 for(const url of urls)URL.revokeObjectURL(url);urls=[];grid.replaceChildren();
 for(const file of event.target.files){
  const card=document.createElement('article');card.className='post';card.dataset.clPost='true';card.dataset.clAccount='';card.dataset.clCaption='';card.dataset.clUrl=location.origin+'/real.html#clip-'+crypto.randomUUID();
  const heading=document.createElement('div');heading.className='postTop';heading.textContent=file.name;
  const field=(text,tag,placeholder,update)=>{const label=document.createElement('label');label.append(text);const input=document.createElement(tag);input.placeholder=placeholder;input.addEventListener('input',()=>update(input.value));label.append(input);card.append(label);};
  card.append(heading);
  field('Posting account','input','creator.username',value=>card.dataset.clAccount=value.replace(/^@/,'').trim());
  field('Post caption','textarea','Caption, names, or relevant on-screen text',value=>card.dataset.clCaption=value);
  field('Original post URL (optional)','input','https://www.instagram.com/reel/…',value=>{try{const url=new URL(value);if(['https:','http:'].includes(url.protocol))card.dataset.clUrl=url.href;}catch{}});
  const media=document.createElement('div');media.className='media';const video=document.createElement('video');video.controls=true;video.muted=true;video.loop=true;video.playsInline=true;
  const url=URL.createObjectURL(file);urls.push(url);video.src=url;media.append(video);card.append(media);grid.append(card);
 }
 document.getElementById('status').textContent=`${event.target.files.length} local clips loaded. Enter accounts and captions, then play each clip. Use different recordings of one phenomenon and lookalike negatives.`;
});
window.addEventListener('pagehide',()=>urls.forEach(url=>URL.revokeObjectURL(url)),{once:true});
