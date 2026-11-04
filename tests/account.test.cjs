const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../extension/content.js'),'utf8');
const helpers=source.slice(source.indexOf('  const blockedPaths'),source.indexOf('  function postUrlOf'));
const {accountOf,userFromHref}=vm.runInNewContext(`${helpers}\n({accountOf,userFromHref})`,{URL,location:{href:'https://www.instagram.com/reels/',hostname:'www.instagram.com'}});
function link(name,comment=false){return {href:`https://www.instagram.com/${name}/`,textContent:name,closest:s=>s.startsWith('ul')&&comment?{}:null};}
function player(links=[],count=1,parentElement=null){return {parentElement,matches:()=>false,querySelectorAll:s=>s==='video'?Array(count).fill({}):links};}
function video(parentElement){return {parentElement,closest:()=>null};}
test('recognizes creator Reels tab seven wrappers above video (reported Instagram layout)',()=>{
 const avatar=link('giftyhome_canada');avatar.href+='reels/';avatar.textContent='';
 const creator=link('giftyhome_canada');creator.href+='reels/';
 let root=player([avatar,creator]);
 for(let i=0;i<7;i++)root=player([],1,root);
 assert.equal(accountOf(video(root),root),'giftyhome_canada');
});
test('profile paths accept Reels tabs but reject post, audio, and external links',()=>{
 assert.equal(userFromHref('/Creator.Name/reels/'),'creator.name');
 assert.equal(userFromHref('/Creator.Name/'),'creator.name');
 for(const href of ['/reel/ABC/','/p/ABC/','/reels/audio/123/','/explore/reels/','/creator/reels/ABC/','https://example.com/creator/reels/'])
   assert.equal(userFromHref(href),'',href);
});
test('creator can be a sibling of deeply nested Reels video wrappers',()=>{
 const root=player([link('creator.name')]);
 const v=video(player([],1,player([],1,root)));
 assert.equal(accountOf(v,v.parentElement),'creator.name');
});
test('does not attribute a different player or comment author',()=>{
 const root=player([link('other_creator')],2);
 const v=video(player([link('commenter',true)],1,root));
 assert.equal(accountOf(v,v.parentElement),'');
});
test('does not search global page navigation',()=>{
 const root=player([link('signed_in_user')]);root.matches=()=>true;
 assert.equal(accountOf(video(player([],1,root)),null),'');
});
