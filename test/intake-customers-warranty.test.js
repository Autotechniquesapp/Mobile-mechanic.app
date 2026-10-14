const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');const {JSDOM}=require('jsdom');
const app=fs.readFileSync('app.js','utf8'),prod=fs.readFileSync('supabase-production.js','utf8');
function helpers(){return app.slice(app.indexOf('function customerPhoneKey'),app.indexOf('function shopIntake'));}
test('directory contacts are excluded; job, vehicle and public-intake customers survive',()=>{
 const start=prod.indexOf('  const intakeIds='),end=prod.indexOf('  const uiCustomers=',start);
 const sandbox={customers:[{id:'contact',phone:'9285550000'},{id:'job'},{id:'vehicle'},{id:'public',email:'A@EXAMPLE.COM'}],jobs:[{customer_id:'job'}],vehicles:[{customer_id:'vehicle'}],intakesRes:{data:[{email:'a@example.com'}]}};
 vm.runInNewContext(helpers()+prod.slice(start,end)+';globalThis.result=intakeCustomers;',sandbox);
 assert.deepEqual(Array.from(sandbox.result,c=>c.id),['job','vehicle','public']);
});
test('search finds names, normalized phones and emails and shows a no-match result',()=>{
 const dom=new JSDOM('<body></body>'),sandbox={document:dom.window.document,currentShop:()=>({customers:[{id:'a',name:'Jane Doe',phone:'(928) 555-1234',email:'jane@example.com'},{id:'b',name:'John Smith',phone:'6025559876'}],jobs:[]}),pageTitle:()=>'',ic:()=>'',esc:v=>String(v||''),shopShell:html=>{dom.window.document.body.innerHTML=html;}};
 vm.runInNewContext(helpers()+app.slice(app.indexOf('function customers(){'),app.indexOf('\nfunction jobs()')),sandbox);sandbox.customers();
 const input=dom.window.document.querySelector('#customerSearch'),rows=[...dom.window.document.querySelectorAll('[data-open-customer-intake]')];
 for(const query of ['jane','9285551234','JANE@EXAMPLE.COM']){input.value=query;input.dispatchEvent(new dom.window.Event('input'));assert.equal(rows[0].hidden,false);assert.equal(rows[1].hidden,true);}
 input.value='missing';input.dispatchEvent(new dom.window.Event('input'));assert.match(dom.window.document.querySelector('#customerSearchCount').textContent,/No matching/);assert.ok(rows.every(r=>r.style.display==='none'));dom.window.close();
});
test('Square sync exports intake customers without importing or overwriting app data',async()=>{
 const source=fs.readFileSync('supabase/functions/square-sync/index.ts','utf8').replace(/^import .*;\n/,'');let writes=[],requests=[];
 const rows={customers:[{id:'app',name:'App Name',phone:'9285551234',updated_at:'2026-10-14T00:00:00Z'},{id:'directory',name:'Personal Contact'}],vehicles:[{customer_id:'app'}],jobs:[],intake_submissions:[],integration_entity_mappings:[{id:'m',local_id:'app',external_id:'ext',last_synced_at:'2026-10-01T00:00:00Z'},{id:'old',local_id:'directory',external_id:'personal'}]};
 const admin={from(table){const q={select(){return q;},eq(){return q;},upsert(row){writes.push({table,row});return q;},insert(){throw new Error('No app inserts permitted');},update(){throw new Error('No app updates permitted');},delete(){throw new Error('No historical mapping deletion');},then(resolve){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve);}};return q;}};
 const sandbox={Response,URL,console,Deno:{serve:()=>{}},createClient:()=>{},fetch:async(url,init)=>{requests.push({url,init});if(init.method==='PUT')return Response.json({customer:{id:'ext',version:2}});return Response.json({customers:[{id:'ext',given_name:'Square Name',phone_number:'9285551234',updated_at:'2026-10-15T00:00:00Z',version:1},{id:'personal',given_name:'Phone Contact'},{id:'unknown',given_name:'Unknown'}]});}};
 vm.runInNewContext(stripTypeScriptTypes(source)+';globalThis.run=syncCustomers;',sandbox);const result=await sandbox.run({admin,shopId:'shop',api:'https://square.test',token:'test'});
 assert.equal(result.imported,0);assert.equal(result.local,1);assert.equal(result.exported,1);assert.equal(rows.customers[0].name,'App Name');const put=requests.find(r=>r.init.method==='PUT');assert.equal(JSON.parse(put.init.body).given_name,'App');assert.ok(writes.every(w=>w.table==='integration_entity_mappings'));assert.ok(writes.every(w=>w.row.local_id==='app'));
});
test('paperwork saves 30-day labor terms and prepares records without claiming a lien',async()=>{
 const dom=new JSDOM('<body><section data-job-work-order></section></body>',{url:'https://mobile-mechanic.app/#workup',runScripts:'outside-only'}),w=dom.window,timers=[],updates=[];
 w.MutationObserver=class{observe(){}};w.setTimeout=fn=>timers.push(fn);
 w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{shopId:'shop',userId:'owner',activeJobId:'job'},shops:{shop:{slug:'autotechniques',name:'AutoTechniques',users:[{id:'owner',role:'owner'}],jobs:[{id:'job',customerName:'Customer',vehicle:{vin:'12345678901234567'}}]}}}));
 w.MobileMechanicSupabase={from(){const q={select(){return q;},eq(){return q;},single:async()=>({data:{ai_workup:{work_order:{preserve:true}}}}),update(row){updates.push(row);return q;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;}};
 w.eval(fs.readFileSync('job-paperwork.js','utf8'));await Promise.all(timers.splice(0).map(fn=>fn()));
 const text=w.document.querySelector('[data-warranty-text]').value;assert.match(text,/30-day labor warranty/);assert.doesNotMatch(text,/90-day|12.month|parts and labor warranty/i);assert.match(text,/Unrelated repairs.*do not void/);
 w.document.querySelector('[data-paperwork-save]').click();for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));assert.equal(updates[0].ai_workup.work_order.preserve,true);assert.equal(updates[0].ai_workup.job_paperwork.warranty_text,text);
 w.document.querySelector('[data-lien-packet]').click();for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));assert.match(w.document.querySelector('[data-lien-print-frame]').srcdoc,/does not create, file, or establish a lien/);assert.match(w.document.querySelector('[data-lien-print-frame]').srcdoc,/Checklist incomplete/);w.close();
});
test('customer signing page requires intent and records acceptance without treating it as payment',async()=>{
 const dom=new JSDOM('<body><main id="app"></main></body>',{url:'https://mobile-mechanic.app/?signInvoice='+'a'.repeat(64),runScripts:'outside-only'}),w=dom.window,calls=[];
 const row={status:'pending',expires_at:'2026-10-21T12:00:00Z',snapshot:{shop:{name:'AutoTechniques'},customer:{name:'Customer'},vehicle:{year:2023,make:'Ford',vin:'12345678901234567'},invoice:{id:'inv',total:4,balance:1,line_items:[{description:'Repair',amount:4}]},warranty:'30-day labor warranty',unpaid_terms:'Balance due upon completion.',payment_amount:1}};
 w.setTimeout=()=>{};w.MobileMechanicSupabase={rpc:async(name,args)=>{calls.push({name,args});if(name==='sign_customer_invoice_acceptance'){row.status='signed';row.signature_name=args.p_name;row.signed_at='2026-10-14T12:00:00Z';return {data:{signed:true}};}return {data:row};}};
 w.eval(fs.readFileSync('estimate-approvals.js','utf8'));await w.MobileMechanicEstimatePublic();assert.match(w.document.body.textContent,/30-day labor warranty/);assert.match(w.document.body.textContent,/does not mark the invoice paid/);w.document.querySelector('#invoiceSignatureSubmit').click();assert.equal(calls.filter(x=>x.name==='sign_customer_invoice_acceptance').length,0);
 w.document.querySelector('#invoiceSignatureName').value='Jane Customer';w.document.querySelector('#invoiceSignatureAccept').checked=true;w.document.querySelector('#invoiceSignatureSubmit').click();for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));assert.equal(calls.filter(x=>x.name==='sign_customer_invoice_acceptance').length,1);assert.equal(calls.find(x=>x.name==='sign_customer_invoice_acceptance').args.p_accept,true);assert.match(w.document.body.textContent,/Jane Customer/);w.close();
});
test('printable invoice includes vehicle, outstanding balance and the recorded signature',async()=>{
 const dom=new JSDOM('<body><section data-job-work-order></section></body>',{url:'https://mobile-mechanic.app/#workup',runScripts:'outside-only'}),w=dom.window,timers=[];
 w.MutationObserver=class{observe(){}};w.setTimeout=fn=>timers.push(fn);
 w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{shopId:'shop',userId:'owner',activeJobId:'job'},shops:{shop:{slug:'autotechniques',name:'AutoTechniques',customers:[{id:'c',address:'Customer address'}],users:[{id:'owner',role:'owner'}],jobs:[{id:'job',customerId:'c',customerName:'Jane',vehicle:{year:2023,make:'Ford',model:'F150',engine:'3.5',vin:'12345678901234567',mileage:12345,plate:'ABC123'}}]}}}));
 const inv={id:'inv',total:4,subtotal:4,tax:0,status:'partially_paid',created_at:'2026-10-14T12:00:00Z',line_items:[{description:'Repair',amount:4}],processor_metadata:{total_paid:3,remaining_calculated:1,warranty_text:'30-day labor warranty'}},acceptance={signature_name:'Jane Customer',signed_at:'2026-10-14T12:05:00Z',snapshot:{invoice:{total:4},warranty:'30-day labor warranty',unpaid_terms:'Balance due upon completion.'}};
 w.MobileMechanicSupabase={from(table){const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},single:async()=>({data:table==='jobs'?{ai_workup:{}}:inv}),maybeSingle:async()=>({data:acceptance}),then(resolve){return Promise.resolve({data:[inv],error:null}).then(resolve);}};return q;}};
 w.eval(fs.readFileSync('job-paperwork.js','utf8'));await Promise.all(timers.splice(0).map(fn=>fn()));w.document.querySelector('[data-invoice-print]').click();for(let i=0;i<3;i++)await new Promise(r=>setImmediate(r));w.document.querySelector('[data-invoice-print-id]').click();for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));const html=w.document.querySelector('[data-invoice-print-frame]').srcdoc;assert.match(html,/12345678901234567/);assert.match(html,/ABC123/);assert.match(html,/Jane Customer/);assert.match(html,/Remaining balance.*\$1\.00/);assert.match(html,/30-day labor warranty/);w.close();
});
