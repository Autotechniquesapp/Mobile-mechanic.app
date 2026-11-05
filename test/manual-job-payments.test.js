const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
async function fixture({role='owner',paid=20,fail=false}={}){
 const dom=new JSDOM('<section data-next-invoice><div class="nxe-title"></div></section>',{url:'https://www.mobile-mechanic.app/#workup',runScripts:'outside-only'}),w=dom.window,calls=[];
 let inv={id:'invoice',status:paid>=100?'paid':'partially_paid',total:100,processor_metadata:{total_paid:paid}},failRequest=fail;
 w.MutationObserver=class{observe(){}};w.setTimeout=()=>0;
 w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{role:'shop',shopId:'shop',activeJobId:'job',userId:'user'},shops:{shop:{users:[{id:'user',role}]}}}));
 w.MobileMechanicInvoiceEditor={current:()=>inv,flushSave:async()=>{},refresh:async()=>{}};
 w.MobileMechanicSupabase={rpc:async(name,args)=>{calls.push({name,args});if(failRequest){failRequest=false;return {error:new Error('Network unavailable')}}inv={...inv,status:'paid',processor_metadata:{total_paid:100,manual_payments:[{method:args.p_method,amount:args.p_amount,paid_at:new Date().toISOString()}]}};return {data:{invoice:inv,job_completed:true}}}};
 w.eval(fs.readFileSync('manual-job-payments.js','utf8'));
 return {dom,w,calls};
}
function submit(w){w.document.querySelector('[data-manual-payment-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
test('Cash, Zelle and Cash App open a receipt form prefilled with the outstanding balance',async()=>{
 for(const method of ['cash','zelle','cash_app']){const h=await fixture();try{
  h.w.document.querySelector(`[data-manual-payment-method="${method}"]`).click();await settle();
  assert.equal(h.w.document.querySelector('input[name=amount]').value,'80.00');
  submit(h.w);await settle();
  assert.equal(h.calls[0].name,'record_manual_job_payment');assert.equal(h.calls[0].args.p_method,method);
  assert.equal(h.calls[0].args.p_amount,80);assert.equal(h.calls[0].args.p_invoice_id,'invoice');
  assert.match(h.w.document.body.textContent,/Job moved to Completed/);
 }finally{h.dom.window.close();}}
});
test('a partial payment sends the chosen amount and invalid overpayments never reach the server',async()=>{
 const h=await fixture();try{h.w.document.querySelector('[data-manual-payment-method=cash]').click();await settle();
 const input=h.w.document.querySelector('input[name=amount]');input.value='81';submit(h.w);await settle();assert.equal(h.calls.length,0);
 input.value='25';submit(h.w);await settle();assert.equal(h.calls[0].args.p_amount,25);
 }finally{h.dom.window.close();}
});
test('a failed request can be retried with the same receipt ID',async()=>{
 const h=await fixture({fail:true});try{h.w.document.querySelector('[data-manual-payment-method=zelle]').click();await settle();submit(h.w);await settle();
 assert.match(h.w.document.querySelector('[data-manual-payment-error]').textContent,/Network unavailable/);
 assert.equal(h.w.document.querySelector('button[type=submit]').disabled,false);
 submit(h.w);await settle();assert.equal(h.calls.length,2);assert.equal(h.calls[0].args.p_request_id,h.calls[1].args.p_request_id);
 }finally{h.dom.window.close();}
});
test('technicians and fully paid invoices do not offer payment buttons',async()=>{
 for(const options of [{role:'technician'},{paid:100}]){const h=await fixture(options);assert.equal(h.w.document.querySelector('[data-manual-payment-method]'),null);h.dom.window.close();}
});
test('changing jobs before submitting cannot record against the newly opened job',async()=>{
 const h=await fixture();try{h.w.document.querySelector('[data-manual-payment-method=cash_app]').click();await settle();
 const db=JSON.parse(h.w.localStorage.getItem('mobile_mechanic_ai_approved_v7'));db.session.activeJobId='other';h.w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify(db));submit(h.w);await settle();assert.equal(h.calls.length,0);
 }finally{h.dom.window.close();}
});
