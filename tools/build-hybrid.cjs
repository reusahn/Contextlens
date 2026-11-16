const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const web = process.argv.includes('--web');
const preview = process.argv.includes('--preview');
const output = web ? (preview ? 'dist/buildhybridai-preview' : 'dist/buildhybridai') : 'extension';
const webAssets = {
  'web-demo/index.html': 'index.html',
  'web-demo/demo.css': 'demo.css',
  'web-demo/demo.js': 'demo.js',
  'test-feed/clips.js': 'clips.js',
  'test-feed/hybrid-fixtures.js': 'hybrid-fixtures.js',
  'extension/shared.js': 'shared.js',
  'extension/hybrid-decision.js': 'hybrid-decision.js'
};

async function configuration() {
  const example = web ? 'hybrid/firebase.config.web.example.json' : 'hybrid/firebase.config.example.json';
  const selected = web ? 'hybrid/firebase.config.web.json' : 'hybrid/firebase.config.local.json';
  if (preview) return JSON.parse(await fs.readFile(path.join(root, example), 'utf8'));
  try {
    return JSON.parse(await fs.readFile(path.join(root, selected), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (web) throw new Error('Copy ' + example + ' to ' + selected + ' and configure App Check to build for hosting.');
    return JSON.parse(await fs.readFile(path.join(root, example), 'utf8'));
  }
}

async function main() {
  const supplied = await configuration();
  const { firebase = {}, appCheckSiteKey, appCheckDebugToken } = supplied;
  const config = {
    firebase: { apiKey:firebase.apiKey, appId:firebase.appId, projectId:firebase.projectId },
    ...(web ? { appCheckSiteKey } : { appCheckDebugToken })
  };
  if (web && !preview) {
    if (appCheckDebugToken || !appCheckSiteKey || !firebase.apiKey || !firebase.projectId || !firebase.appId) {
      throw new Error('A hosted build requires Firebase web settings and a reCAPTCHA Enterprise site key. Keep App Check debug tokens in the local extension build.');
    }
  }
  const outdir = path.join(root, output);
  await build({
    entryPoints: [path.join(root, 'hybrid/firebase-client.mjs')],
    outfile: path.join(outdir, 'hybrid.bundle.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    define: { CONTEXTLENS_FIREBASE_CONFIG: JSON.stringify(config) },
    legalComments: 'eof'
  });
  if (web) {
    await Promise.all(Object.entries(webAssets).map(([source, name]) => fs.copyFile(path.join(root, source), path.join(outdir, name))));
    await fs.copyFile(path.join(root, 'web-demo/index.html'), path.join(outdir, 'fallback.html'));
  }
  console.log(`Built ContextLens ${web ? 'web demo' : 'extension'} in ${output}.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
