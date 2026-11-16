const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const [projectId, appId, ...extra] = process.argv.slice(2);
const configFields = ['apiKey', 'appId', 'projectId'];
const cliVersion = '15.36.0';

function fetchConfig() {
  const args = ['--yes', `firebase-tools@${cliVersion}`, 'apps:sdkconfig', 'WEB'];
  if (appId) args.push(appId);
  args.push('--project', projectId, '--json', '--non-interactive');
  return new Promise((resolve, reject) => {
    const cli = spawn('npx', args, { cwd:root, stdio:['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    cli.stdout.setEncoding('utf8');
    cli.stdout.on('data', part => { stdout += part; });
    cli.on('error', reject);
    cli.on('close', code => {
      if (code !== 0) {
        reject(new Error('Firebase could not read the Web app. Log in with npx firebase-tools login and check the project ID and Web app access. If the project has multiple Web apps, pass the desired App ID after the project ID.'));
        return;
      }
      try {
        const { sdkConfig } = JSON.parse(stdout).result;
        if (sdkConfig?.projectId !== projectId || (appId && sdkConfig.appId !== appId) ||
            !configFields.every(key => typeof sdkConfig[key] === 'string' && sdkConfig[key].trim())) {
          throw new Error();
        }
        resolve(Object.fromEntries(configFields.map(key => [key, sdkConfig[key]])));
      } catch {
        reject(new Error('Unexpected Firebase Web SDK configuration. Use the manual setup in docs/BUILD_HYBRID_AI.md.'));
      }
    });
  });
}

async function prepareConfig(file, attestationField, firebase) {
  const target = path.join(root, 'hybrid', file);
  let previous = {};
  let exists = false;
  try {
    previous = JSON.parse(await fs.readFile(target, 'utf8'));
    exists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Could not read hybrid/${file}. Check its JSON before retrying.`);
  }
  for (const key of ['projectId', 'appId']) {
    if (previous.firebase?.[key] && previous.firebase[key] !== firebase[key]) {
      throw new Error(`hybrid/${file} belongs to another Firebase app. Move it aside before connecting this app.`);
    }
  }
  const config = { firebase, [attestationField]: previous[attestationField] || '' };
  return { target, exists, config };
}

async function main() {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId || '') ||
      (appId && !/^1:\d+:web:[a-f0-9]+$/i.test(appId)) || extra.length) {
    throw new Error('Usage: npm run firebase:setup -- PROJECT_ID [WEB_APP_ID]');
  }
  const firebase = await fetchConfig();
  const configs = await Promise.all([
    prepareConfig('firebase.config.local.json', 'appCheckDebugToken', firebase),
    prepareConfig('firebase.config.web.json', 'appCheckSiteKey', firebase)
  ]);
  for (const { target, exists, config } of configs) {
    await fs.writeFile(target, JSON.stringify(config, null, 2) + '\n', {
      flag:exists ? 'w' : 'wx', mode:0o600
    });
  }
  console.log(`Connected both local configuration files to ${projectId}.`);
  console.log('Run npm run build:hybrid for the on-device extension test.');
  console.log('Add App Check settings before cloud testing and hosting. See docs/BUILD_HYBRID_AI.md.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
