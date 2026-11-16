const grid=document.getElementById('grid'),status=document.getElementById('status');
const hybridDemo = new URLSearchParams(location.search).has("hybrid");
const subjects=[
  ['Memes','When you pretend to know the answer 😂'],['Food','A chef explains a five-minute pasta recipe'],
  ['Sports','This incredible soccer training moment'],['Fashion','New runway outfits from our studio'],
  ['Science','A physics lab explores how waves move'],['Travel','Five places to see on a coastal trip'],
  ['Technology','A tiny robot learns to navigate'],['Education','Our classroom creative workshop']
];
let sources=[],seed=1;
function randint(n){return Math.floor(Math.random()*n)}
function render(){grid.replaceChildren();let posts=[];
  // The same viral source is represented by multiple DISTINCT accounts at the top.
  for(let i=0;i<100;i++){
    const scene=i<8?i:8+randint(8), account=`studio_${String(seed)}_${String(i).padStart(2,'0')}`;
    posts.push({scene,account,caption:i<8?['Moving without walking','How does this floating dance work?','Feet sliding through the air','Whoa, gravity just disappeared','Try that crazy slide!','Look at this footwork','Did their shoes just glide?','Dancer moving on air'][i]:subjects[scene%8][1],id:`demo-${seed}-${i}`});
  }
  if (hybridDemo) {
    posts = CL_HYBRID_POSTS.map((post, i) => ({...post, id:`hybrid-${seed}-${i}`}));
  }
  posts.forEach((p,i)=>{
    const card=document.createElement('article');card.className='post';card.dataset.clPost='true';card.dataset.clAccount=p.account;card.dataset.clCaption=p.caption;
    card.dataset.clUrl=`https://www.instagram.com/reel/fictional-${p.id}/`;
    const top=document.createElement('div');top.className='postTop';top.innerHTML=`<span class="avatar">${i%9}</span><div><div class="who">@${p.account}</div><div class="time">SYNTHETIC POST ${i+1} / ${posts.length}</div></div>`;
    const media=document.createElement('div');media.className='media';const video=document.createElement('video');video.loop=true;video.muted=true;video.playsInline=true;video.preload='metadata';
    if(sources[p.scene])video.src=sources[p.scene];media.append(video);
    const footer=document.createElement('div');footer.className='postFooter';footer.textContent=p.caption;
    const small=document.createElement('small');small.textContent=`Fictional account · Scene ${p.scene+1}`;footer.appendChild(small);
    card.append(top,media,footer);grid.appendChild(card);
  });
  const observer=new IntersectionObserver(entries=>entries.forEach(x=>{
    const video=x.target.querySelector('video');if(!video)return;
    if(x.isIntersecting)video.play().catch(()=>{});else video.pause();
  }),{rootMargin:'200px'});
  grid.querySelectorAll('.post').forEach(e=>observer.observe(e));
  if (hybridDemo) {
    status.textContent='Four fictional posts: same named challenge, a different named challenge, and a vague caption.';
    return;
  }
  status.textContent='100 synthetic posts created. The first eight clips depict the same glide-like viral motif, each newly rendered and visually different. Enable AI + Share frames + local bridge to test semantic grouping.';
}
if (hybridDemo) {
  document.querySelector('.intro h1').textContent = 'ContextLens caption comparison';
  document.querySelector('.intro p').textContent = 'Four locally rendered clips and fictional captions for the hybrid inference demo.';
  document.querySelector('.chip').textContent = 'CAPTION COMPARISON';
  document.querySelector('.note').textContent = 'Enable Firebase caption mode in ContextLens, set N = 2, then scroll the posts. Check the route label and whether each post counts.';
  document.getElementById('new').textContent = 'Generate a fresh set of post IDs';
}
async function init() {
  status.textContent = 'Generating sample clips…';
  const scenes = hybridDemo ? CL_HYBRID_POSTS.map(post => post.scene) : Array.from({length:16},(_,i)=>i);
  await Promise.all(scenes.map(async scene => { sources[scene] = await createVideo(scene); }));
  render();
}
document.getElementById('new').onclick=()=>{seed++;render();};
document.getElementById('clear').onclick=()=>alert('Click the ContextLens toolbar popup → Reset counts.');
init().catch(e=>status.textContent=`Synthetic video generation failed: ${e.message}`);
