const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let count=0;
for(const dir of ['bridge','extension','test-feed','tools','tests'])for(const name of fs.readdirSync(path.join(root,dir)))if(/\.(?:js|cjs)$/.test(name)) {
 execFileSync(process.execPath,['--check',path.join(root,dir,name)],{stdio:'pipe'});count++;
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json')));
for(const script of manifest.content_scripts[0].js)if(!fs.existsSync(path.join(root,'extension',script)))throw Error('Missing content script: '+script);
console.log(`Syntax and manifest checks passed (${count} JavaScript files).`);
