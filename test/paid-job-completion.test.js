const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const production=fs.readFileSync('supabase-production.js','utf8'),app=fs.readFileSync('app.js','utf8');
function harness(rows,options={}){
  const dom=new JSDOM('<body></body>',{url:'https://mobile-mechanic.app/#jobs'}),w=dom.window;
  let cache={session:{role:'shop',shopId:'s'},shops:{s:{jobs:[{id:'paid',status:'AI Pre-Workup',completedAt:null},{id:'deposit',status:'In Progress',completedAt:null}]}}},events=0;
  const sandbox={document:w.document,window:w,Event:w.Event,console,readCache:()=>cache,writeCache:value=>cache=value,setInterval:()=>0,sb:{from(table){assert.equal(table,'jobs');return {select(columns){assert.equal(columns,'id,status,completed_at');return this},eq:async(key,value)=>{assert.equal(key,'shop_id');assert.equal(value,'s');if(options.switchShop)cache.session.shopId='other';return {data:rows,error:options.error}}}}}};
  w.addEventListener('mobile-mechanic-jobs-updated',()=>events++);
  const start=production.indexOf('function statusToUi('),end=production.indexOf("const PPI_MARKER",start);
  vm.runInNewContext(production.slice(start,end)+';globalThis.refresh=refreshJobStatuses;globalThis.mapStatus=statusToUi;',sandbox);
  return {dom,sandbox,get cache(){return cache},get events(){return events}};
}
test('a confirmed paid/completed job moves out of active state while a deposit remains active',async()=>{
  const h=harness([{id:'paid',status:'completed',completed_at:'2026-10-31T06:05:15Z'},{id:'deposit',status:'repairing',completed_at:null}]);await h.sandbox.refresh();
  assert.equal(h.cache.shops.s.jobs[0].status,'Completed');assert.equal(h.cache.shops.s.jobs[0].completedAt,'2026-10-31T06:05:15Z');assert.equal(h.cache.shops.s.jobs[1].status,'In Progress');assert.equal(h.events,1);await h.sandbox.refresh();assert.equal(h.events,1);h.dom.window.close();
});
test('legacy paid status is displayed as Completed',()=>{const h=harness([]);assert.equal(h.sandbox.mapStatus('paid'),'Completed');h.dom.window.close();});
test('a response after switching shops cannot change either shop workspace',async()=>{
  const h=harness([{id:'paid',status:'completed',completed_at:'2026-10-31T06:05:15Z'}],{switchShop:true});await h.sandbox.refresh();assert.equal(h.cache.shops.s.jobs[0].status,'AI Pre-Workup');assert.equal(h.events,0);h.dom.window.close();
});
test('completed paid jobs are absent from the rendered work board; deposit jobs remain',()=>{
  const dom=new JSDOM('<body></body>'),s={jobs:[{id:'paid',customerName:'Paid Customer',status:'Completed'},{id:'deposit',customerName:'Deposit Customer',status:'In Progress'}]};
  const sandbox={currentShop:()=>s,esc:v=>String(v||''),vehicleText:()=>'',assetTerm:()=>'',ic:()=>'',pageTitle:()=>'',scheduleWindow:()=>'',shopShell:html=>dom.window.document.body.innerHTML=html};
  vm.runInNewContext(app.slice(app.indexOf('function jobs(){'),app.indexOf('function jobById('))+';jobs();',sandbox);
  assert.equal(dom.window.document.querySelector('[data-open-job="paid"]'),null);assert.ok(dom.window.document.querySelector('[data-open-job="deposit"]'));dom.window.close();
});

for(const name of ['square-sync','square-invoice']){
  const source=fs.readFileSync(`supabase/functions/${name}/index.ts`,'utf8');
  const start=source.indexOf('async function completeFullyPaidJob('),end=source.indexOf('\n}\n',start)+3;
  const helper=require('node:module').stripTypeScriptTypes(source.slice(start,end));
  async function run(rows,error=null){
    const writes=[],reads=[];
    const admin={from(table){let values;const filters={};const q={select(){return q},update(v){values=v;return q},eq(k,v){filters[k]=v;return q},neq(k,v){filters[`not_${k}`]=v;return q},then(resolve){if(table==='invoices')reads.push({table,filters});else writes.push({table,filters,values});return Promise.resolve({data:rows,error}).then(resolve)}};return q}};
    const sandbox={};vm.runInNewContext(helper+';globalThis.complete=completeFullyPaidJob;',sandbox);const result=await sandbox.complete(admin,'shop','job');return {result,writes,reads};
  }
  test(`${name}: final payment completes only the exact shop/job and preserves payment date`,async()=>{
    const {result,writes,reads}=await run([{total:100,status:'paid',paid_at:'2026-10-31T06:05:15Z'},{total:50,status:'paid',paid_at:'2026-11-01T06:00:00Z'}]);assert.equal(result,true);assert.deepEqual(reads[0].filters,{shop_id:'shop',job_id:'job'});assert.deepEqual(writes[0].filters,{shop_id:'shop',id:'job',not_status:'completed'});assert.equal(writes[0].values.status,'completed');assert.equal(writes[0].values.completed_at,'2026-11-01T06:00:00Z');
  });
  test(`${name}: deposits, unpaid additional work and drafts never auto-complete`,async()=>{
    for(const status of ['partially_paid','sent','draft','deposit_due']){const {result,writes}=await run([{total:100,status:'paid'},{total:50,status}]);assert.equal(result,false);assert.equal(writes.length,0);}
    assert.equal((await run([{total:100,status:'partially_paid'}])).writes.length,0);
  });
  test(`${name}: no invoice or zero-value draft cannot be mistaken for payment`,async()=>{
    for(const rows of [[],[{total:0,status:'draft'}],[{total:0,status:'paid'}]])assert.equal((await run(rows)).writes.length,0);
    assert.equal((await run([{total:100,status:'paid'},{total:20,status:'void'}])).result,true);
  });
  test(`${name}: failed reads do not mark a job complete`,async()=>{await assert.rejects(run([],{message:'Database unavailable'}));});
}
