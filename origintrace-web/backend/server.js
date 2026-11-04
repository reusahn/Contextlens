import {config} from 'dotenv';
import {fileURLToPath as envFileURLToPath} from 'node:url';
config({path:envFileURLToPath(new URL('../.env', import.meta.url))});
import express from 'express';
import cors from 'cors';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {analysisRouter} from './routes/analysis.js';
import {readBudgetStatus} from './services/metaBudget.js';
import {runtimeCapabilities} from './services/runtimeCapabilities.js';
const capabilities=runtimeCapabilities();

const app = express();
const port = Number(process.env.PORT || 3001);
const uploadDir = join(fileURLToPath(new URL('.', import.meta.url)), 'uploads');
await mkdir(uploadDir, {recursive:true});
app.disable('x-powered-by');
app.use(cors({origin:process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}));
app.use(express.json({limit:'1mb'}));
app.get('/api/health', (_req,res)=>res.json({ok:true,capabilities,budget:readBudgetStatus(),vision:Boolean(process.env.META_API_KEY?.trim()),search:(process.env.SEARCH_PROVIDER||'meta')==='tavily'?Boolean(process.env.TAVILY_API_KEY?.trim()):process.env.META_SEARCH_BILLING_MODE==='best_effort'&&Boolean(process.env.META_API_KEY?.trim()),searchProvider:process.env.SEARCH_PROVIDER||'meta'}));
app.use('/api',analysisRouter(uploadDir));
app.use((err,_req,res,_next)=>res.status(err.status || 400).json({error:'Request failed'}));
// Session-assisted extraction must remain a local service.
app.listen(port,process.env.INSTAGRAM_COOKIES_BROWSER?'127.0.0.1':undefined,()=>console.log(`OriginTrace backend: http://localhost:${port}`));
