// Optional real Chromium regression. npm install --no-save playwright;
// npx playwright install chromium; npm run test:browser
const assert=require('node:assert/strict');const {start}=require('./browser-fixture.cjs');
async function main(){
 let chromium;try{({chromium}=require('playwright'));}catch{throw Error('Install Playwright and Chromium to run the browser regression. See README_KO.md.');}
 const server=await start(0);let browser;
 try {
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1000,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'Show video',exact:true}).waitFor({timeout:20000});
  assert.equal(await page.locator('video').evaluate(v=>v.paused),true);
  assert.ok(await page.evaluate(()=>fixture.requests[0].imageDataUrls.length>=3));
  await page.getByRole('button',{name:'Investigate in OriginTrace ↗',exact:true}).click();
  assert.equal(await page.evaluate(()=>fixture.investigations),1);assert.equal(await page.evaluate(()=>fixture.platformClicks),0);
  // Native keyboard activation through the Shadow DOM, after a geometry change.
  await page.mouse.wheel(0,100);await page.getByRole('button',{name:'Show video',exact:true}).press('Enter');
  assert.equal(await page.locator('video').evaluate(v=>v.classList.contains('cl-video-blurred')),false);
  assert.equal(await page.evaluate(()=>fixture.platformClicks),0);assert.equal(await page.getByRole('button',{name:'Show video',exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log('Chromium: pointer isolation, investigation dispatch, keyboard reveal, scrolling and playback checks passed. Recognition was stubbed.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
