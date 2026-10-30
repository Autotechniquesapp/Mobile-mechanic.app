/*
 * Live DOM regression tests for the simplified repair-order screen.
 * Billing is now in next-invoice.js. This component must NOT render
 * AI parts suggestions, pricing attestations, diagnostics, or checklists.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); }
catch (err) {
  if (process.env.MMA_REQUIRE_DOM_TESTS) throw new Error('jsdom required for job screen tests: '+err.message);
}
const describe = JSDOM ? test.describe : test.describe.skip;
const SHOP_ID = 'shop-test-0001', JOB_ID = 'job-0001', USER_ID = 'usr_tech_7';

async function mountJob({users=[{id:USER_ID,name:'Dave Ruiz',role:'owner',active:true}],userId=USER_ID}={}){
  const dom = new JSDOM(`<!doctype html><html><body>
   <div class="page-title"><h2>AI Pre-Workup</h2><p>sub</p></div>
   <div class="job-banner">Truck brake adjustment</div>
   <section class="work-white"><label class="diag-check"><input type="checkbox">Old AI checklist</label></section>
   <div class="btn-row"><button data-route="findings">Technician Findings</button></div>
  </body></html>`,{url:'https://mobile-mechanic.app/',runScripts:'dangerously',pretendToBeVisual:true});
  const {window}=dom;
  const recorder={updates:[],aiWorkup:{work_order:{
    parts:[{name:'Brake pads',price:null,status:'inspect_first',from_ai:true}],
    work:[{name:'AI proposed repair',hours:null,from_ai:true}],
    tests:[{name:'Measure brakes',status:'to_do'}],
    authorization:{status:'',note:''}
  }}};
  if(!window.structuredClone)window.structuredClone=v=>JSON.parse(JSON.stringify(v));
  window.MobileMechanicSupabase={
    from(table){
      const chain={
        select(){return chain;},eq(){return chain;},order(){return chain;},limit(){return chain;},
        maybeSingle(){return Promise.resolve({data:table==='jobs'?{id:JOB_ID,customer_states:'Rear brake adjustment',ai_workup:recorder.aiWorkup,status:'in_progress'}:null,error:null});},
        single(){return Promise.resolve({data:{ai_workup:recorder.aiWorkup},error:null});},
        update(changes){recorder.updates.push(changes);return chain;},
        then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject);}
      };return chain;
    }
  };
  window.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({
    session:{role:'shop',shopId:SHOP_ID,userId,activeJobId:JOB_ID},
    shops:{[SHOP_ID]:{id:SHOP_ID,users,jobs:[{id:JOB_ID,complaint:'Rear brake adjustment',vehicle:{year:2020,make:'Ram',model:'3500'}}]}}
  }));
  for(const file of ['work-order-pricing.js','job-work-order.js']){
    const script=window.document.createElement('script');
    script.textContent=read(file);window.document.head.appendChild(script);
  }
  await new Promise(resolve=>window.setTimeout(resolve,1100));
  return {dom,window,recorder};
}

describe('simple repair-order screen, no checklists',()=>{
  const opened=[];
  test.after(()=>opened.forEach(({window})=>window.close()));

  test('owner sees one short editable complaint and no AI/test/sign-off panels',async()=>{
    const ctx=await mountJob();opened.push(ctx.dom);
    const doc=ctx.window.document;
    assert.ok(doc.querySelector('[data-job-work-order]'));
    assert.ok(doc.querySelector('[data-jwo-complaint]'));
    assert.equal(doc.querySelector('.work-white'),null);
    assert.equal(doc.querySelector('[data-jwo-totals]'),null);
    assert.equal(doc.querySelector('[data-jwo-attest]'),null);
    assert.equal(doc.querySelector('[data-jwo-check]'),null);
    assert.equal(doc.querySelector('[data-jwo-add]'),null);
    assert.equal(doc.querySelector('[data-jwo-quick-form]'),null);
    assert.equal(doc.querySelector('[data-jwo-section="tests"]'),null);
    assert.doesNotMatch(doc.querySelector('[data-job-work-order]').textContent,/AI proposed repair|Brake pads|Measure brakes|sign off|checklist/i);
  });

  test('work requested is editable and persists on this job',async()=>{
    const ctx=await mountJob();opened.push(ctx.dom);
    const el=ctx.window.document.querySelector('[data-jwo-complaint]');
    el.value='Adjust both rear parking brakes';
    el.dispatchEvent(new ctx.window.Event('change',{bubbles:true}));
    await new Promise(resolve=>ctx.window.setTimeout(resolve,30));
    assert.ok(ctx.recorder.updates.some(row=>row.customer_states==='Adjust both rear parking brakes'));
    const db=JSON.parse(ctx.window.localStorage.getItem('mobile_mechanic_ai_approved_v7'));
    assert.equal(db.shops[SHOP_ID].jobs[0].complaint,'Adjust both rear parking brakes');
  });

  test('removed user and inactive user cannot edit the complaint',async()=>{
    for(const opts of [{userId:'not-in-roster'},{users:[{id:USER_ID,name:'Dave Ruiz',role:'owner',active:false}]}]){
      const ctx=await mountJob(opts);opened.push(ctx.dom);
      assert.equal(ctx.window.document.querySelector('[data-jwo-complaint]'),null);
    }
  });

  test('multi-user technician cannot edit; sole-shop technician can',async()=>{
    const multi=await mountJob({users:[{id:USER_ID,role:'technician',active:true},{id:'owner',role:'owner',active:true}]});opened.push(multi.dom);
    assert.equal(multi.window.document.querySelector('[data-jwo-complaint]'),null);
    const solo=await mountJob({users:[{id:USER_ID,role:'technician',active:true}]});opened.push(solo.dom);
    assert.ok(solo.window.document.querySelector('[data-jwo-complaint]'));
  });
});
