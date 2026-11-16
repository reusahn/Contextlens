const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const privateConfig = path.join(root, 'hybrid/firebase.config.local.json');
const config = JSON.parse(fs.readFileSync(
  fs.existsSync(privateConfig) ? privateConfig : path.join(root, 'hybrid/firebase.config.example.json'),
  'utf8'
));

build({
  entryPoints: [path.join(root, 'hybrid/firebase-client.mjs')],
  outfile: path.join(root, 'extension/hybrid.bundle.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  define: { CONTEXTLENS_FIREBASE_CONFIG: JSON.stringify(config) },
  legalComments: 'eof'
}).catch(() => { process.exitCode = 1; });
