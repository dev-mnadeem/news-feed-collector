import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const upstreams = {
  newsapi: ['https://newsapi.org/v2/everything', 'NEWSAPI_KEY', 'apiKey', ['q','from','to','language','sortBy','pageSize']],
  guardian: ['https://content.guardianapis.com/search', 'GUARDIAN_KEY', 'api-key', ['q','from-date','to-date','show-fields','page-size','order-by']],
  nyt: ['https://api.nytimes.com/svc/search/v2/articlesearch.json', 'NYT_KEY', 'api-key', ['q','begin_date','end_date','sort','fq']],
};
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
const MAX_BYTES = 2_000_000;

export function createApp({env=process.env, fetchImpl=globalThis.fetch, root=resolve('dist')} = {}) {
  let active=0, count=0, windowStart=Date.now();
  return createServer(async (request,response) => {
    const reply=(status,body) => { response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); response.end(JSON.stringify(body)); };
    const url=new URL(request.url,'http://localhost');
    if(request.method !== 'GET') return reply(405,{error:'GET required'});
    if(url.pathname === '/health') return reply(200,{status:'ok'});
    if(url.pathname.startsWith('/api/')) {
      const provider=upstreams[url.pathname.replace('/api/news/','')];
      if(!provider || url.pathname !== '/api/news/'+Object.keys(upstreams).find(key=>upstreams[key]===provider)) return reply(404,{error:'Unknown source'});
      if(!env[provider[1]]) return reply(503,{error:'Source is not configured'});
      if(Date.now()-windowStart >= 60_000) { count=0;windowStart=Date.now(); }
      if(active>=12 || count>=60) return reply(429,{error:'Source request limit reached'});
      if([...url.searchParams].some(([key,value])=>!provider[3].includes(key) || value.length>500)) return reply(400,{error:'Invalid source parameters'});
      const target=new URL(provider[0]);
      for(const [key,value] of url.searchParams) target.searchParams.set(key,value);
      target.searchParams.set(provider[2],env[provider[1]]);
      // Client disconnects and the deadline both cancel the upstream request.
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),8000);
      const disconnect=()=>{if(!response.writableEnded) controller.abort();};
      response.on('close',disconnect);active++;count++;
      try {
        const upstream=await fetchImpl(target,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}});
        if(!upstream.ok) return reply(502,{error:'Source request failed'});
        let length=0;const chunks=[];
        for await(const chunk of upstream.body) {
          length+=chunk.length;
          if(length>MAX_BYTES) { controller.abort();return reply(502,{error:'Source response exceeds limit'}); }
          chunks.push(chunk);
        }
        const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return reply(200,payload);
      } catch { return reply(502,{error:'Source is unavailable'}); }
      finally { clearTimeout(timer);response.off('close',disconnect);active--; }
    }
    try {
      const path=resolve(root,'.'+decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if(!path.startsWith(root+'/')) return reply(404,{error:'Not found'});
      let file=path;
      if(!extname(file)) file=resolve(root,'index.html');
      const body=await readFile(file);
      response.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});response.end(body);
    } catch { reply(404,{error:'Not found'}); }
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  createApp().listen(Number(process.env.PORT || 7150),process.env.HOST || '127.0.0.1');
}
