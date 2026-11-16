const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../extension/manifest.json');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

test('Firebase hybrid route requires consent when Chrome’s local model is unavailable', async () => {
  const config = {
    firebase:{ apiKey:'mock-key', appId:'1:0000000000:web:test', projectId:'contextlens-test' },
    appCheckDebugToken:'mock-token'
  };
  const built = buildSync({
    entryPoints:[path.resolve(__dirname,'../hybrid/firebase-client.mjs')],
    bundle:true, format:'cjs', platform:'browser', write:false,
    define:{ CONTEXTLENS_FIREBASE_CONFIG:JSON.stringify(config) }
  }).outputFiles[0].text;

  const requests = [];
  const completion = JSON.stringify({
    status:'uncertain', candidateId:'', label:'', currentCue:'', priorCue:''
  });
  const fakeFetch = async (url, options) => {
    const endpoint = new URL(url);
    requests.push({ endpoint, options });
    assert.ok(manifest.host_permissions.includes(endpoint.origin + '/*'));
    if (endpoint.hostname === 'content-firebaseappcheck.googleapis.com') {
      return Response.json({ token:'mock-app-check-proof', ttl:'3600s' });
    }
    assert.equal(endpoint.hostname, 'firebasevertexai.googleapis.com');
    return Response.json({
      candidates:[{ content:{ role:'model', parts:[{ text:completion }] }, finishReason:'STOP' }]
    });
  };
  const sandbox = vm.createContext({
    module:{ exports:{} }, console:{ log(){}, info(){}, debug(){}, warn(){}, error(){} },
    navigator:{ onLine:true }, fetch:fakeFetch, URL, URLSearchParams, Response, Request,
    Headers, AbortController, AbortSignal, setTimeout, clearTimeout
  });
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.runInContext(built, sandbox);
  const { compareCaptions, prepareLocalModel } = sandbox.module.exports;

  await assert.rejects(compareCaptions('Tried this today.', [], false), /local model/);
  assert.equal(requests.length, 0);

  sandbox.LanguageModel = {
    availability:async () => 'available',
    create:async () => ({ destroy(){}, prompt:async () => completion })
  };
  await prepareLocalModel();
  assert.equal((await compareCaptions('Tried this today.', [], true)).source, 'on_device');
  assert.equal(requests.length, 0);

  sandbox.LanguageModel.availability = async () => 'unavailable';
  await assert.rejects(compareCaptions('Tried this today.', [], false), /local model/);
  assert.equal(requests.length, 0);
  assert.equal((await compareCaptions('Tried this today.', [], true)).source, 'in_cloud');
  assert.deepEqual(requests.map(request => request.endpoint.hostname), [
    'content-firebaseappcheck.googleapis.com', 'firebasevertexai.googleapis.com'
  ]);
  assert.equal(new Headers(requests[1].options.headers).get('X-Firebase-AppCheck'), 'mock-app-check-proof');
  assert.equal(JSON.parse(requests[1].options.body).generationConfig.responseMimeType, 'application/json');
});
