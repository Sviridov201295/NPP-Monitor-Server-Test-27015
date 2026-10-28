'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
process.env.INGEST_TOKEN='test-token';
const {sanitize}=require('../telemetry');
const {handler,constantEqual,state}=require('../server');

test('token comparison',()=> {
  assert.equal(constantEqual('secret','secret'),true);
  assert.equal(constantEqual('secret','secret2'),false);
  assert.equal(constantEqual('',''),false);
});
test('sanitization drops private keys, retains meaningful nulls',()=>{
  const p=sanitize({source:'demo', steamid:'secret',s:{run:true,steamid:'123',city:{station:2000,ip:'secret'},tb:{rpm:3000,crew:'hidden'},rx:{chans:60},probs:[{text:'<script>bad</script>',sev:2,private:'abc'}]}});
  assert.equal(p.source,'demo');
  assert.equal(p.s.city.station,2000);
  assert.equal(p.s.tb.rpm,3000);
  assert.equal('steamid' in p.s,false);
  assert.equal('crew' in p.s.tb,false);
  assert.equal('fuelSec' in p.s,false);
  assert.equal('private' in p.s.probs[0],false);
});
test('API can ingest with key; visitors read without key', async()=>{
  const server = http.createServer(handler);
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const r=await fetch(url+'/api/state');assert.equal(r.status,200);const snap=await r.json();assert.ok('connected' in snap);
    const unauth=await fetch(url+'/api/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"s":{}}'});
    assert.equal(unauth.status,401);
    const authorized=await fetch(url+'/api/ingest',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer test-token'},body:JSON.stringify({source:'live',s:{run:true,city:{station:2000,load:2100},steamid:'123'}})});
    assert.equal(authorized.status,200);
    const after=await(await fetch(url+'/api/state')).json();
    assert.equal(after.telemetry.s.city.station,2000);
    assert.equal(after.telemetry.s.run,true);
    assert.equal(after.telemetry.s.steamid,undefined);
    assert.equal(after.connected,true);
    const h=await fetch(url+'/health');assert.equal((await h.json()).ok,true);
    const site=await fetch(url+'/');assert.equal(site.status,200);
    assert.match(await site.text(),/АЭС «Синдикат»/);
  } finally { await new Promise(ok=>server.close(ok)); }
});
