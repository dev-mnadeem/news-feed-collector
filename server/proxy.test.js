import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './index.js';

async function withApp(options,run) {
 const server=createApp(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try { await run('http://127.0.0.1:'+server.address().port); }
 finally { await new Promise(resolve=>server.close(resolve)); }
}
test('only server-injected keys reach the fixed upstream',async()=>{
 let target;
 await withApp({env:{NEWSAPI_KEY:'server-only-test-key'},fetchImpl:async url=>{target=url;return new Response(JSON.stringify({articles:[]}));}},async base=>{
  const response=await fetch(base+'/api/news/newsapi?q=rail');assert.equal(response.status,200);
  assert.equal(target.origin,'https://newsapi.org');assert.equal(target.searchParams.get('apiKey'),'server-only-test-key');
  assert.ok(!(await response.text()).includes('server-only-test-key'));
  assert.equal((await fetch(base+'/api/news/newsapi?apiKey=attacker')).status,400);
  assert.equal((await fetch(base+'/api/news/unknown')).status,404);
 });
});
test('missing configuration and upstream failures stay sanitized',async()=>{
 await withApp({env:{}},async base=>assert.equal((await fetch(base+'/api/news/nyt')).status,503));
 await withApp({env:{NYT_KEY:'private-test-key'},fetchImpl:async()=>{throw new Error('private-test-key');}},async base=>{
  const response=await fetch(base+'/api/news/nyt');assert.equal(response.status,502);assert.ok(!(await response.text()).includes('private-test-key'));
 });
});
test('oversized upstream bodies are rejected',async()=>{
 await withApp({env:{GUARDIAN_KEY:'test'},fetchImpl:async()=>new Response('x'.repeat(2_000_001))},async base=>{
 assert.equal((await fetch(base+'/api/news/guardian')).status,502);
 });
});
