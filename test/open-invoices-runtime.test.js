const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {JSDOM}=require('jsdom');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function browser(){
  const dom=new JSDOM('<body></body>',{url:'https://mobile-mechanic.app/#dashboard',runScripts:'outside-only'}),w=dom.window,calls=[];
  w.MutationObserver=class{observe(){}};w.setTimeout=()=>0;w.setInterval=()=>0;w.confirm=()=>true;
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{role:'shop',shopId:'shop',userId:'owner'},shops:{shop:{users:[{id:'owner',role:'owner'}],jobs:[{id:'job',status:'In Progress',customerName:'Chris'}]}}}));
  const tables={payment_processor_invoices:[{external_invoice_id:'ext',local_invoice_id:'inv',status:'UNPAID',total:100,paid:30,balance:70},{external_invoice_id:'imported',status:'UNPAID',total:20,balance:20},{external_invoice_id:'draft',status:'DRAFT',total:10,balance:10}],invoices:[{id:'inv',job_id:'job',processor_status:'UNPAID',processor_payment_id:'ext',total:100}],payment_transactions:[{external_payment_id:'pay',status:'COMPLETED',amount:30}]};
  w.MobileMechanicSupabase={from(table){const q={select(){return q},eq(){return q},order(){return q},in(){return q},then(resolve){return Promise.resolve({data:tables[table]||[],error:null}).then(resolve)}};return q},functions:{invoke:async(name,options)=>{calls.push({name,body:options.body});return {data:{ok:true},error:null}}}};
  w.eval(fs.readFileSync('square-sync.js','utf8'));await w.MobileMechanicSquareSync.openInvoices();return {dom,w,calls};
}
test('open list excludes drafts/payment history, deduplicates invoice, and offers job actions',async()=>{
  const {dom,w}=await browser();const list=w.document.querySelector('[data-square-invoice-list]');
  assert.equal(list.querySelectorAll('.square-invoice-row').length,2);
  assert.equal(list.querySelectorAll('[data-square-open-job]').length,1);
  assert.ok(list.querySelector('[data-action="complete-job"][data-job="job"]'));
  assert.ok(list.querySelector('[data-action="delete-job"][data-job="job"]'));
  assert.equal(list.querySelector('[data-square-delete-draft]'),null);
  w.document.querySelector('[data-square-invoice-tab="drafts"]').click();await settle();
  assert.equal(list.querySelectorAll('.square-invoice-row').length,1);assert.ok(list.querySelector('[data-square-delete-draft]'));
  w.document.querySelector('[data-square-invoice-tab="payments"]').click();await settle();
  assert.match(list.textContent,/30.00 payment/);assert.equal(list.querySelector('[data-square-cancel]'),null);dom.window.close();
});
test('imported invoice cancellation and draft deletion send external ID with shop scope',async()=>{
  const {dom,w,calls}=await browser();w.document.querySelector('[data-square-external-id="imported"]').click();await settle();await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{name:'square-invoice',body:{action:'cancel',invoice_id:'',external_invoice_id:'imported',shop_id:'shop'}});
  w.document.querySelector('[data-square-invoice-tab="drafts"]').click();await settle();w.document.querySelector('[data-square-delete-draft]').click();await settle();
  assert.ok(calls.some(c=>c.body.action==='delete_draft'&&c.body.external_invoice_id==='draft'));dom.window.close();
});
test('Open Job delegates to the existing job navigation and closes the invoice dialog',async()=>{
  const {dom,w}=await browser();let jobId;w.document.addEventListener('click',e=>{if(e.target.dataset.openJob)jobId=e.target.dataset.openJob});
  w.document.querySelector('[data-square-open-job]').click();assert.equal(jobId,'job');assert.equal(w.document.querySelector('[data-square-invoices-modal]'),null);dom.window.close();
});
async function lifecycle(action,status,role='owner',hasMirror=true){
  let handler;const calls=[],writes=[];
  const admin={from(table){const filters={};let write;const q={select(){return q},eq(k,v){filters[k]=v;return q},update(v){write=v;writes.push({table,values:v});return q},upsert(v){write=v;writes.push({table,values:v});return q},maybeSingle:async()=>({data:table==='payment_processor_invoices'?(hasMirror?{shop_id:'shop',external_invoice_id:'ext',total:100}:null):table==='shop_members'?{shop_id:'shop',role,status:'active'}:table==='shop_payment_processors'?{status:'connected'}:table==='payment_processor_credentials'?{access_token:'test',location_id:'loc'}:null,error:null}),then(resolve){return Promise.resolve({data:write||[],error:null}).then(resolve)}};return q}};
  const source=fs.readFileSync('supabase/functions/square-invoice/index.ts','utf8').replace(/^import .*;\n/,'');
  vm.runInNewContext(stripTypeScriptTypes(source),{Response,Request,URL,crypto,console,createClient:(_url,_key,options)=>options?.global?{auth:{getUser:async()=>({data:{user:{id:'user'}}})}}:admin,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},fetch:async(url,init)=>{calls.push({url,method:init.method||'GET'});return Response.json({invoice:{id:'ext',version:7,status:init.method==='POST'?'CANCELED':status,payment_requests:[{computed_amount_money:{amount:10000}}]}})}});
  const response=await handler(new Request('https://example.com',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action,external_invoice_id:'ext',shop_id:'shop'})}));return {response,calls,writes};
}
test('Square-only unpaid invoice can be canceled and updates the mirror without a fake local record',async()=>{
  const {response,calls,writes}=await lifecycle('cancel','UNPAID');assert.equal(response.status,200);assert.ok(calls.some(c=>c.method==='POST'&&c.url.endsWith('/cancel')));assert.ok(writes.some(w=>w.table==='payment_processor_invoices'&&w.values.status==='CANCELED'));assert.equal(writes.some(w=>w.table==='invoices'),false);
});
test('draft deletion uses current Square version and marks the mirror canceled',async()=>{
  const {response,calls,writes}=await lifecycle('delete_draft','DRAFT');assert.equal(response.status,200);assert.ok(calls.some(c=>c.method==='DELETE'&&c.url.endsWith('?version=7')));assert.ok(writes.some(w=>w.values.status==='CANCELED'));
});
test('published and paid invoices cannot be deleted, paid invoices cannot be canceled',async()=>{
  for(const [action,status] of [['delete_draft','UNPAID'],['delete_draft','PAID'],['cancel','PAID']]){const {response,calls}=await lifecycle(action,status);assert.equal(response.status,409);assert.equal(calls.some(c=>c.method!=='GET'),false)}
});
test('technicians and invoices outside the shop mirror cannot perform Square lifecycle actions',async()=>{
  const denied=await lifecycle('cancel','UNPAID','technician');assert.equal(denied.response.status,403);assert.equal(denied.calls.length,0);
  const absent=await lifecycle('cancel','UNPAID','owner',false);assert.equal(absent.response.status,404);assert.equal(absent.calls.length,0);
});
