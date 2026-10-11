const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { JSDOM } = require('jsdom');
const payment = fs.readFileSync('next-invoice.js', 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function browser(invoice) {
  const dom = new JSDOM('<body><section data-job-work-order></section></body>', {url:'https://mobile-mechanic.app/#workup',runScripts:'outside-only'});
  const w = dom.window, timers = [], calls = [];
  w.structuredClone = structuredClone;
  w.MutationObserver = class { observe() {} };
  w.setTimeout = fn => {timers.push(fn);};
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{role:'shop',shopId:'shop',userId:'owner',activeJobId:'job'},shops:{shop:{users:[{id:'owner',role:'owner'}],jobs:[{id:'job'}]}}}));
  w.MobileMechanicSupabase = {
    from(table) {
      const q = {select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},update(){calls.push('update:'+table);return q;},
        single:async()=>({data:{ai_workup:{work_order:{parts:[{name:'Part',amount:3}],work:[{name:'Labor',hours:1,rate:1}]}}}}),
        maybeSingle:async()=>q.single(),then(resolve){return Promise.resolve({data:table==='invoices'?[invoice]:null,error:null}).then(resolve);}};
      return q;
    },functions:{invoke:async(name,args)=>{calls.push(args.body);return {error:new Error('POS unavailable')};}}
  };
  return {dom,w,timers,calls};
}

test('two loader executions render one payment panel and one history button', async () => {
  const {dom,w,timers}=browser({id:'inv',total:4,status:'draft',processor_metadata:{source:'additional_work_estimate'}});
  w.eval(payment);w.eval(payment);
  await Promise.all(timers.splice(0).map(fn=>fn()));await settle();
  assert.equal(w.document.querySelectorAll('[data-next-invoice]').length,1);
  assert.equal(w.document.querySelectorAll('[data-nxe-history]').length,1);
  dom.window.close();
});

test('paid invoice has no tap charge control', async () => {
  const {dom,w,timers}=browser({id:'inv',total:4,status:'paid',processor_metadata:{source:'additional_work_estimate',total_paid:4}});
  w.eval(payment);await Promise.all(timers.splice(0).map(fn=>fn()));await settle();
  assert.equal(w.document.querySelector('[data-nxe-tap-square]'),null);
  dom.window.close();
});

test('partial payment charges only the balance, preserves invoice amounts, and resets after failure', async () => {
  const {dom,w,timers,calls}=browser({id:'inv',total:4,status:'partially_paid',processor_metadata:{source:'additional_work_estimate',total_paid:3}});
  w.eval(payment);await Promise.all(timers.splice(0).map(fn=>fn()));await settle();
  assert.match(w.document.querySelector('[data-nxe-tap-square]').textContent,/\$1\.00/);
  w.document.querySelector('[data-nxe-tap-square]').click();await settle();await settle();
  const requests=calls.filter(x=>typeof x==='object');
  assert.equal(requests.length,1);assert.equal(requests[0].amount,1);
  assert.ok(!calls.includes('update:invoices'));
  assert.equal(w.document.querySelector('[data-nxe-tap-square]').disabled,false);
  assert.doesNotMatch(w.document.querySelector('[data-nxe-tap-square]').textContent,/Opening/);
  dom.window.close();
});

async function posRequest(squareStatus, paid, requested) {
  const invoice={id:'inv',shop_id:'shop',total:4,status:'unpaid',processor_metadata:{square_invoice_id:'square-inv'}};
  let handler;
  const admin={from(table){const data={invoices:invoice,shop_members:{shop_id:'shop',role:'owner',status:'active'},shop_payment_processors:{status:'connected'},payment_processor_credentials:{access_token:'test',location_id:'loc'}}[table];
    const q={select(){return q;},eq(){return q;},update(){return q;},upsert(){return q;},insert(){return q;},maybeSingle:async()=>({data,error:null}),then(resolve){return Promise.resolve({data,error:null}).then(resolve);}};return q;}};
  const source=fs.readFileSync('supabase/functions/square-invoice/index.ts','utf8').replace(/^import .*;\n/,'');
  vm.runInNewContext(stripTypeScriptTypes(source),{Response,Request,URL,crypto,console,
    createClient:(_url,_key,options)=>options?.global?{auth:{getUser:async()=>({data:{user:{id:'user'}}})}}:admin,
    Deno:{env:{get:()=> 'test'},serve:fn=>{handler=fn;}},
    fetch:async()=>Response.json({invoice:{id:'square-inv',status:squareStatus,payment_requests:[{computed_amount_money:{amount:400},total_completed_amount_money:{amount:paid}}]}})
  });
  return handler(new Request('https://example.com',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'pos_checkout_link',invoice_id:'inv',amount:requested})}));
}

test('server rejects a paid Square invoice even when local status is stale', async()=>{
  const response=await posRequest('PAID',400,4);assert.equal(response.status,409);
});
test('server rejects full total after a deposit and permits only the remaining balance', async()=>{
  assert.equal((await posRequest('PARTIALLY_PAID',300,4)).status,409);
  const response=await posRequest('PARTIALLY_PAID',300,1);assert.equal(response.status,200);
  assert.equal((await response.json()).amount_cents,100);
});

test('customer sync sends a supported Square sort field', async()=>{
  const source=fs.readFileSync('supabase/functions/square-sync/index.ts','utf8').replace(/^import .*;\n/,'');
  let requested;
  const sandbox={Response,URL,console,createClient:()=>{},Deno:{serve:()=>{}},fetch:async(url)=>{
    requested=new URL(url);
    if(!['DEFAULT','CREATED_AT'].includes(requested.searchParams.get('sort_field')))return Response.json({errors:[{detail:'Invalid sort field'}]},{status:400});
    return Response.json({customers:[]});
  }};
  vm.runInNewContext(stripTypeScriptTypes(source)+'\nglobalThis.runSyncCustomers=syncCustomers;',sandbox);
  const admin={from(){const q={select(){return q;},eq(){return q;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};return q;}};
  const result=await sandbox.runSyncCustomers({admin,shopId:'shop',api:'https://connect.squareup.com',token:'test'});
  assert.equal(requested.pathname,'/v2/customers');
  assert.equal(result.square,0);
});
