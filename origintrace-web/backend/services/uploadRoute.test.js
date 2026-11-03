import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {analysisRouter} from '../routes/analysis.js';
test('multipart upload reaches Express router and analyzer with saved video bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'upload-route-'));
 try{
  let received=false;
  const router=analysisRouter(dir,{analyzeImpl:async({filePath,filename,caption})=>{
   received=true;assert.equal(filename,'clip.mp4');assert.equal(caption,'Dover harbor rescue');assert.equal(await readFile(filePath,'utf8'),'mock-video-bytes');
   return {status:'mock analysis complete'};
  }});
  const body=Buffer.from('--origintrace-boundary\r\nContent-Disposition: form-data; name="caption"\r\n\r\nDover harbor rescue\r\n--origintrace-boundary\r\nContent-Disposition: form-data; name="video"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\nmock-video-bytes\r\n--origintrace-boundary--\r\n');
  const request=Readable.from([body]);request.headers={'content-type':'multipart/form-data; boundary=origintrace-boundary','content-length':String(body.length)};request.method='POST';request.url='/analyze';request.ip='127.0.0.1';
  const result=await new Promise((resolve,reject)=>{
   const response={status(code){this.statusCode=code;return this;},json(data){resolve(data);}};
   router.handle(request,response,reject);
  });
  assert.ok(received);assert.equal(result.status,'mock analysis complete');
 }finally{await rm(dir,{recursive:true,force:true});}
});
