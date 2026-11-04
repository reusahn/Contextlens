import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractorArgs,extractionFailure,platformInfo} from './platformMedia.js';
test('canonical Instagram URL and Chrome session are passed as separate arguments only when configured',()=>{
 const old=process.env.INSTAGRAM_COOKIES_BROWSER;
 try{
  delete process.env.INSTAGRAM_COOKIES_BROWSER;
  assert.ok(!extractorArgs('https://www.instagram.com/reels/abc/').includes('--cookies-from-browser'));
  process.env.INSTAGRAM_COOKIES_BROWSER='chrome:Profile 1';
  const args=extractorArgs('https://www.instagram.com/reels/abc/');
  assert.deepEqual(args.slice(-4),['--cookies-from-browser','chrome:Profile 1','--','https://www.instagram.com/reel/abc/']);
 }finally{if(old===undefined)delete process.env.INSTAGRAM_COOKIES_BROWSER;else process.env.INSTAGRAM_COOKIES_BROWSER=old;}
});
test('video-only formats remain available for vision; combined audio/video is preferred',()=>{
 const silent={url:'https://cdn.example.com/silent.mp4',ext:'mp4',vcodec:'h264',acodec:'none'};
 const combined={...silent,url:'https://cdn.example.com/combined.mp4',acodec:'aac'};
 assert.equal(platformInfo({formats:[silent]},'https://www.instagram.com/reel/abc/').video,silent.url);
 assert.equal(platformInfo({formats:[silent,combined]},'https://www.instagram.com/reel/abc/').video,combined.url);
});
test('extraction failures expose actionable categories without raw extractor output',()=>{
 assert.match(extractionFailure("This content isn't available to everyone: certain audiences"),/restricted/);
 assert.match(extractionFailure('failed to decrypt cookies secret'),/session could not be read/);
 assert.match(extractionFailure('HTTP Error 429'),/rate-limited/);
 assert.match(extractionFailure('Could not resolve host'),/network/);
 assert.ok(!extractionFailure('unexpected secret details').includes('secret'));
});
