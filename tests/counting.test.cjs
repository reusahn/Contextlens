const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {clPostKey,clScenePosts,clSceneCount}=require('../extension/shared');
test('post identity ignores tracking parameters and alternate post paths',()=>{
 assert.equal(clPostKey('https://www.instagram.com/reel/Abc_12/?igsh=tracking'),'instagram:Abc_12');
 assert.equal(clPostKey('https://www.instagram.com/p/Abc_12/'),'instagram:Abc_12');
 for(const value of ['https://www.instagram.com/reels/','https://www.instagram.com/creator/reels/','https://example.com/reel/Abc/'])assert.equal(clPostKey(value),'');
});
test('legacy account history recovers retained posts without inventing discarded history',()=>{
 const scene={accounts:[{account:'alice',postUrl:'https://www.instagram.com/reel/one/'}],posts:[{account:'alice',postUrl:'https://www.instagram.com/p/one/?tracking=1'},{account:'alice',postUrl:'https://www.instagram.com/reel/two/'}]};
 assert.equal(clScenePosts(scene).length,2);assert.equal(clSceneCount(scene,{countUnit:'posts'}),2);assert.equal(clSceneCount(scene,{countUnit:'accounts'}),1);
});
const source=fs.readFileSync(require.resolve('../extension/content'),'utf8');
const code=source.slice(source.indexOf('  function postUrlOf'),source.indexOf('  function captionOf'));
const location={href:'https://www.instagram.com/creator/reels/'};
const postUrlOf=vm.runInNewContext(`${code};postUrlOf`,{URL,clPostKey,location,ACCOUNT_MAX_DEPTH:32});
function node(links=[],count=1,parentElement=null){return {parentElement,matches:()=>false,querySelectorAll:s=>s==='video'?Array(count).fill({}):links};}
const link=url=>({href:url,closest:()=>null,querySelector:()=>null});
const video=parentElement=>({parentElement,closest:()=>null});
test('post permalink may be a sibling above deeply nested player wrappers',()=>{
 let wrapper=node([link('https://www.instagram.com/reel/example/')]);
 for(let i=0;i<20;i++)wrapper=node([],1,wrapper);
 assert.equal(postUrlOf(video(wrapper),wrapper),'https://www.instagram.com/reel/example/');
});
test('ambiguous permalinks and other video players do not invent a post ID',()=>{
 const many=node([link('https://www.instagram.com/reel/one/'),link('https://www.instagram.com/reel/two/')]);
 assert.equal(postUrlOf(video(many),many),location.href);
 const boundary=node([link('https://www.instagram.com/reel/other/')],2),wrapper=node([],1,boundary);
 assert.equal(postUrlOf(video(wrapper),wrapper),location.href);
});
