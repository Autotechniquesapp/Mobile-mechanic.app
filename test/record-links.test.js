const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('record-links.js','utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
async function browser(markup,extra={}){
  const dom=new JSDOM(`<div id="app">${markup}</div>`,{url:'https://mobile-mechanic.app/#jobs',runScripts:'outside-only'}),w=dom.window;
  const customers=[{id:'a',name:'Alex Smith',phone:'928-555-0100',email:'alex@example.com',address:'123 Main St, Yuma AZ',vehicles:[{year:2015,make:'Ford',model:'F-150'}]},{id:'b',name:'Alex Smith',phone:'928-555-0200'}];
  const jobs=[{id:'one',customerId:'a',customerName:'Alex Smith',phone:'928-555-0100',status:'In Progress',complaint:'Brakes',vehicle:{make:'Ford'}},{id:'two',customerId:'a',customerName:'Alex Smith',status:'Completed',complaint:'Oil change',vehicle:{make:'Ford'}},{id:'other',customerId:'b',customerName:'Alex Smith',status:'Scheduled',complaint:'Other customer'}];
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{role:'shop',shopId:'s'},shops:{s:{id:'s',customers,jobs},other:{customers:[{id:'secret',name:'Other Shop'}],jobs:[{id:'hidden',customerId:'a',complaint:'Private'}]}},...extra}));
  const intakes=[{id:'original',converted_job_id:'one',customer_name:'Alex Smith',phone:'928-555-0100',created_at:'2026-10-02T15:30:00Z',vehicle:{year:2015,make:'Ford',vin:'ORIGINALVIN'},customer_states:'Original customer complaint',availability:'Friday afternoon'},{id:'older',converted_job_id:'two',customer_name:'Alex Smith',phone:'928-555-0100',created_at:'2026-09-01T14:00:00Z',customer_states:'Previous intake'},{id:'wrong',customer_name:'Alex Smith',phone:'928-555-0200',created_at:'2026-10-03T10:00:00Z',customer_states:'Other person intake'}];
  w.MobileMechanicSupabase={from(table){assert.equal(table,'intake_submissions');let intakeId;const q={select(){return q},eq(key,value){if(key==='shop_id')assert.equal(value,'s');if(key==='id')intakeId=value;return q},order(){return q},range:async()=>({data:intakeId?intakes.filter(i=>i.id===intakeId):intakes,error:null}),maybeSingle:async()=>({data:intakes.find(i=>i.id===intakeId),error:null})};return q}};
  w.eval(source);await pause();return {dom,w};
}
test('name inside a job opens all customer visits without opening the containing job',async()=>{
  const {dom,w}=await browser('<div data-open-job="one"><b>Alex Smith</b><small>Ford</small></div>');let opened=0;
  w.document.addEventListener('click',e=>{if(e.target.closest('[data-open-job]'))opened++;},true);
  w.document.querySelector('[data-record-link="customer"]').click();
  const profile=w.document.querySelector('[data-record-profile]');assert.equal(opened,0);assert.equal(profile.querySelectorAll('[data-record-job]').length,2);assert.match(profile.textContent,/Completed/);assert.doesNotMatch(profile.textContent,/Other customer|Private/);assert.equal(profile.querySelector('a[href^="sms:"]').textContent,'Text');
  dom.window.close();
});
test('ambiguous names outside job context ask which customer instead of merging their jobs',async()=>{
  const {dom,w}=await browser('<b>Alex Smith</b>');w.document.querySelector('[data-record-link]').click();assert.match(w.document.querySelector('[data-record-profile]').textContent,/Choose customer/);assert.equal(w.document.querySelectorAll('[data-record-customer]').length,2);
  w.document.querySelector('[data-record-customer="b"]').click();assert.equal(w.document.querySelectorAll('[data-record-job]').length,1);assert.match(w.document.querySelector('[data-record-profile]').textContent,/Other customer/);dom.window.close();
});
test('customer tile opens a profile, job history opens the exact job, and nested actions remain intact',async()=>{
  const {dom,w}=await browser('<div data-open-customer-intake="a">Alex Smith<button data-action="add-vehicle">Add Vehicle</button></div>');let added=0,opened;
  w.document.querySelector('[data-action]').onclick=()=>added++;w.document.querySelector('[data-action]').click();assert.equal(added,1);assert.equal(w.document.querySelector('[data-record-profile]'),null);
  w.document.querySelector('[data-open-customer-intake]').click();assert.ok(w.document.querySelector('[data-record-profile]'));
  w.document.addEventListener('click',e=>{if(e.target.dataset.openJob)opened=e.target.dataset.openJob;});w.document.querySelector('[data-record-job="two"]').click();assert.equal(opened,'two');assert.equal(w.document.querySelector('[data-record-profile]'),null);dom.window.close();
});
test('dynamic schedule names support keyboard access; contact actions override containing calendar row',async()=>{
  const {dom,w}=await browser('');const app=w.document.getElementById('app');app.innerHTML='<button data-cal-edit="one"><b>Alex Smith</b></button><div data-cal-open-job="one"><small>123 Main St, Yuma AZ</small><p>928-555-0100</p></div>';await pause();
  const name=w.document.querySelector('[data-record-link="customer"]');name.focus();name.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.ok(w.document.querySelector('[data-record-profile]'));w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(w.document.activeElement,name);
  let url;w.open=value=>url=value;w.document.querySelector('[data-record-link="address"]').click();assert.match(url,/destination=123%20Main/);
  w.document.querySelector('[data-record-link="phone"]').click();assert.ok(w.document.querySelector('[data-record-profile] a[href="tel:9285550100"]'));assert.ok(w.document.querySelector('[data-record-profile] a[href="sms:9285550100"]'));dom.window.close();
});
test('public intake, logged out users, editable text, existing links and unrelated words are untouched',async()=>{
  const {dom,w}=await browser('<input value="Alex Smith"><textarea>Alex Smith</textarea><div contenteditable="true">Alex Smith</div><a href="tel:123">928-555-0100</a><p>Alex Smithson</p>');assert.equal(w.document.querySelectorAll('[data-record-link]').length,0);dom.window.close();
  const loggedOut=await browser('<b>Alex Smith</b>',{session:null});assert.equal(loggedOut.w.document.querySelectorAll('[data-record-link]').length,0);loggedOut.dom.window.close();
  const publicPage=await browser('<section class="customer-shell"><b>Alex Smith</b></section>');assert.equal(publicPage.w.document.querySelectorAll('[data-record-link]').length,0);publicPage.dom.window.close();
});
test('customer name opens original intake first with submission timestamp and earlier submissions',async()=>{
  const {dom,w}=await browser('<div data-open-job="one"><b>Alex Smith</b></div>');w.document.querySelector('[data-record-link]').click();await pause();
  const panel=w.document.querySelector('[data-record-profile]'),intake=panel.querySelector('[data-record-intake-content]');assert.match(intake.textContent,/Original customer complaint/);assert.match(intake.textContent,/ORIGINALVIN/);assert.match(intake.textContent,/Friday afternoon/);assert.equal(intake.querySelector('time').dateTime,'2026-10-02T15:30:00Z');assert.match(intake.textContent,/Previous intake/);assert.doesNotMatch(intake.textContent,/Other person intake/);assert.equal(panel.querySelector('section').children[1],intake);dom.window.close();
});
test('unconverted intake name opens that exact submitted form and timestamp',async()=>{
  const {dom,w}=await browser('<span data-record-submission="older" role="link" tabindex="0">Alex Smith</span>');w.document.querySelector('[data-record-submission]').click();await pause();const intake=w.document.querySelector('[data-record-intake-content]');assert.match(intake.textContent,/Previous intake/);assert.doesNotMatch(intake.textContent,/Original customer complaint/);assert.equal(intake.querySelector('time').dateTime,'2026-09-01T14:00:00Z');dom.window.close();
});
test('disconnected lookup does not substitute the job creation date',async()=>{
  const {dom,w}=await browser('<div data-open-job="one"><b>Alex Smith</b></div>');w.MobileMechanicSupabase=undefined;w.document.querySelector('[data-record-link]').click();assert.match(w.document.querySelector('[data-record-intake-content]').textContent,/unavailable while disconnected/);dom.window.close();
});

test('a name on an older job opens the intake linked to that job first',async()=>{
  const {dom,w}=await browser('<div data-open-job="two"><b>Alex Smith</b></div>');w.document.querySelector('[data-record-link]').click();await pause();const article=w.document.querySelector('[data-record-intake-content] article');assert.match(article.textContent,/Previous intake/);assert.equal(article.querySelector('time').dateTime,'2026-09-01T14:00:00Z');dom.window.close();
});
