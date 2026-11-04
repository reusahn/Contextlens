// Stable axes keep reports comparable; detailed formats stay separate from subjects.
export const FORMAT_FAMILIES = Object.freeze([
 {id:'participation',label:'Trends & challenges',tags:['Challenge','Trend']},
 {id:'humor',label:'Humor & remix',tags:['Meme','Reaction','Remix','Comedy']},
 {id:'reporting',label:'News & discussion',tags:['News Event','Interview','Documentary','Commentary']},
 {id:'learning',label:'Learning & how-to',tags:['Tutorial','Explainer','Recipe','Demonstration']},
 {id:'consumer',label:'Reviews & shopping',tags:['Review','Advertisement','Unboxing','Comparison']},
 {id:'story',label:'Stories & performance',tags:['Performance','Vlog','Storytime','Animation','Clip']}
]);
export const FORMAT_TAGS=Object.freeze([...FORMAT_FAMILIES.flatMap(f=>f.tags),'Other']);
export const SUBJECT_TAGS=Object.freeze(['Politics','Education','Commerce','Food','Advertising','Fashion','Memes','Entertainment','Sports','Technology','Science','Health','Travel','Gaming','Art','Music','Nature','Animals','Lifestyle','Finance','Other']);
export const CATEGORY_SCHEMA={type:'object',properties:{
 subject:{type:'string',enum:SUBJECT_TAGS},
 formats:{type:'array',maxItems:6,items:{type:'object',properties:{tag:{type:'string',enum:FORMAT_TAGS},weight:{type:'number',minimum:0,maximum:100},reason:{type:'string'}},required:['tag','weight','reason'],additionalProperties:false}}
},required:['subject','formats'],additionalProperties:false};
export const CATEGORY_INSTRUCTIONS='Also return categoryProfile: choose a subject and up to six supported format tags, each with a relative relevance weight 0-100 and a short evidence-based reason. A subject such as Food is independent of format such as Recipe or Review. Weights are descriptive relevance, not probabilities or video time percentages. Use Other with weight 0 when format evidence is absent. Do not infer an advertisement without promotional evidence.';

const RULES={
 Challenge:/\bchallenge\b|챌린지/iu,Trend:/\b(?:trend|trending|viral trend)\b|유행/iu,
 Meme:/\bmeme\b|밈/iu,Reaction:/\breact(?:ion|s|ing)?\b|리액션/iu,Remix:/\b(?:remix|mashup)\b|리믹스/iu,Comedy:/\b(?:comedy|skit|parody|prank)\b|코미디/iu,
 'News Event':/\b(?:breaking news|news report|election|protest|earthquake|flood)\b|뉴스|속보/iu,
 Interview:/\binterview\b|인터뷰/iu,Documentary:/\bdocumentary\b|다큐/iu,Commentary:/\b(?:commentary|opinion|debate|analysis)\b|논평/iu,
 Tutorial:/\b(?:tutorial|how to|step by step|lesson)\b|강좌|사용법/iu,Explainer:/\b(?:explained|explainer|why does|how it works)\b|원리|설명/iu,
 Recipe:/\b(?:recipe|ingredients|preheat|tablespoons?|teaspoons?)\b|레시피|조리법/iu,Demonstration:/\b(?:demonstration|demo|experiment)\b|시연|실험/iu,
 Review:/\b(?:review|taste test|honest opinion|rating)\b|리뷰|시식|후기/iu,Advertisement:/\b(?:sponsored|paid partnership|advertisement|promo code|ad)\b|유료광고|협찬/iu,
 Unboxing:/\bunbox(?:ing)?\b|언박싱/iu,Comparison:/\b(?:comparison|versus|vs\.?|compared)\b|비교/iu,
 Performance:/\b(?:performance|singing|dancing|concert|dance|cover song)\b|공연|노래|춤/iu,
 Vlog:/\b(?:vlog|day in my life|daily routine)\b|브이로그/iu,Storytime:/\b(?:storytime|story time|my story)\b|썰/iu,Animation:/\b(?:animation|animated|cartoon)\b|애니메이션/iu
};
const SUBJECT_RULES={Food:/\b(?:food|recipe|cook(?:ing)?|dish|restaurant|noodles?|pizza|burger|chef|ingredients)\b|음식|요리|레시피|맛집/iu,
 Politics:/\b(?:election|politics|parliament|president)\b|정치/iu,Education:/\b(?:lesson|tutorial|learning|classroom)\b|교육/iu,
 Commerce:/\b(?:shopping|store|sale|unboxing)\b|쇼핑/iu,Advertising:/\b(?:sponsored|advertisement|paid partnership)\b|광고/iu,
 Fashion:/\b(?:fashion|outfit|clothing|makeup)\b|패션/iu,Memes:/\bmeme\b|밈/iu,Entertainment:/\b(?:comedy|skit|movie|celebrity)\b|예능/iu,
 Sports:/\b(?:sports?|football|basketball|soccer|match)\b|스포츠|축구/iu,Technology:/\b(?:technology|software|phone|computer|robot)\b|기술/iu,
 Science:/\b(?:science|physics|chemistry|experiment)\b|과학/iu,Health:/\b(?:health|fitness|workout|medical)\b|건강/iu,Travel:/\b(?:travel|tourism|vacation|trip)\b|여행/iu,
 Gaming:/\b(?:gaming|gameplay|videogame)\b|게임/iu,Art:/\b(?:painting|sculpture|drawing|artwork)\b|미술/iu,Music:/\b(?:music|singing|concert|song)\b|음악/iu,
 Nature:/\b(?:nature|wildlife|forest|ocean)\b|자연/iu,Animals:/\b(?:cat|dog|animal|pet)\b|동물|고양이|강아지/iu,Lifestyle:/\b(?:vlog|daily routine|lifestyle)\b|일상/iu,Finance:/\b(?:finance|investment|stocks|banking)\b|금융/iu};
function proportions(rows){
 const total=rows.reduce((n,r)=>n+r.weight,0);if(!total)return [];
 const scaled=rows.map(r=>({...r,share:Math.floor(r.weight/total*100)}));
 const remainder=100-scaled.reduce((n,r)=>n+r.share,0);
 const order=rows.map((r,i)=>({i,fraction:r.weight/total*100-scaled[i].share})).sort((a,b)=>b.fraction-a.fraction);
 for(let i=0;i<remainder;i++)scaled[order[i].i].share++;
 return scaled.map(({weight,...r})=>r);
}
export function buildCategoryReport({vision=null,caption='',transcript='',title='',indexed=false}={}){
 const text=[title,caption,transcript].filter(Boolean).join('\n').slice(0,18000);
 const model=vision?.categoryProfile;
 const seen=new Set();
 const supported=Array.isArray(model?.formats)?model.formats.filter(x=>x&&FORMAT_TAGS.includes(x.tag)&&x.tag!=='Other'&&typeof x.weight==='number'&&Number.isFinite(x.weight)&&x.weight>0&&x.weight<=100&&!seen.has(x.tag)&&seen.add(x.tag)).slice(0,6).map(x=>({tag:x.tag,weight:x.weight,reason:String(x.reason||'').slice(0,240)})):[];
 const inferred=supported.length>0;
 const formats=proportions(inferred?supported:Object.entries(RULES).filter(([,rule])=>rule.test(text)).map(([tag])=>({tag,weight:1,reason:'Explicit format wording appears in the available text.'})));
 const subject=SUBJECT_TAGS.includes(model?.subject)?model.subject:Object.entries(SUBJECT_RULES).find(([,rule])=>rule.test(text))?.[0]||'Other';
 const axes=FORMAT_FAMILIES.map(f=>({id:f.id,label:f.label,share:formats.filter(r=>f.tags.includes(r.tag)).reduce((n,r)=>n+r.share,0)}));
 const basis=inferred?'Meta sampled-frame interpretation':text?indexed?'Unverified search-index text':'Available caption / transcript / title':'No classifiable clip evidence';
 return {version:1,status:formats.length?'classified':'insufficient',subject,formats,axes,basis,method:inferred?'model-relative-weights':'explicit-text-cues',taxonomy:{subjects:SUBJECT_TAGS,families:FORMAT_FAMILIES},
 summary:formats.length?`${subject} subject; strongest format: ${formats.slice().sort((a,b)=>b.share-a.share)[0].tag}. ${inferred?'Based on sampled-frame interpretation.':'Estimated from explicit text cues; the format may differ from the video.'}`:'Not enough clip-specific evidence to assign a format. No percentages have been invented.',
 qualification:'Relative relevance shares sum to 100% across assigned formats. They are not calibrated probabilities, portions of playback time, or evidence of authenticity. Related article content is excluded from clip classification.'};
}
