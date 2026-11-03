// Offline synthetic Instagram-style feed, no third-party footage or scraping.
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const files={'/':'index.html','/index.html':'index.html','/demo.js':'demo.js','/demo.css':'demo.css','/real.html':'real.html','/real.js':'real.js'};
http.createServer((req,res)=>{const name=files[new URL(req.url,'http://localhost').pathname];if(!name){res.writeHead(404);res.end();return;}let content=fs.readFileSync(path.join(__dirname,name));res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store'});res.end(content);}).listen(8765,'127.0.0.1',()=>console.log('Open test feed: http://127.0.0.1:8765'));
