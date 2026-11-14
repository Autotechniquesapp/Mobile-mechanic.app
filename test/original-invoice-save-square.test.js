const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const editor=fs.readFileSync('next-invoice.js','utf8');

const beginning=editor.indexOf('async function loadSquareDraft(');
const ending=editor.indexOf('function recalc(');
assert.ok(beginning>=0&&ending>beginning,'original invoice helper code is present');
const helpersSource=editor.slice(beginning,ending);
const guardSource=editor.slice(editor.indexOf('function financialsLocked('),editor.indexOf('function vehicleText('));

function helperScope(rows=[]){
 const q={select(){return q},eq(){return q},order(){return q},limit(){return Promise.resolve({data:rows,error:null})}};
 const scope={sb:{from(){return q}},context:()=>({sid:'shop'}),roundMoney:n=>Math.round((Number(n)||0)*100)/100,Number,String,Array,Math};
 vm.createContext(scope);
 vm.runInContext(helpersSource+';globalThis.helpers={loadSquareDraft,stateFromExistingInvoice,isSquareCheckoutLink};',scope);
 return scope;
}

const original={
 id:'original-250',job_id:'job-1',status:'draft',payment_processor:'square',total:250,
 processor_metadata:{source:'additional_work_estimate'},
 line_items:[
  {kind:'labor',description:'Diagnosis and key programming (includes key pickup)',amount:150,quantity:1,flat_fee:true},
  {kind:'part',description:'Transponder ignition key',amount:100,quantity:1,unit_price:100}
 ]
};

test('existing $250 invoice loads instead of starting another blank Square draft',async()=>{
 const newerEmpty={id:'empty',job_id:'job-1',status:'draft',payment_processor:'square',total:0,
   line_items:[],processor_metadata:{source:'additional_work_estimate'}};
 const h=helperScope([newerEmpty,original]);
 const invoice=await h.helpers.loadSquareDraft({id:'job-1'});
 assert.equal(invoice.id,'original-250');
 const state=h.helpers.stateFromExistingInvoice({
   parts:[],labor:[],tax_rate:8.4,tax_enabled:true,travel_fee:50,travel_enabled:true
 },invoice);
 assert.equal(state.labor[0].amount,150);
 assert.equal(state.parts[0].amount,100);
 assert.equal(state.tax_enabled,false);
 assert.equal(state.travel_enabled,false);
 assert.equal(state.labor[0].name,'Diagnosis and key programming (includes key pickup)');
});

test('already-linked Square invoice takes precedence over another local draft',async()=>{
 const h=helperScope([original,{...original,id:'linked',processor_metadata:{square_invoice_id:'sq-1'}}]);
 assert.equal((await h.helpers.loadSquareDraft({id:'job-1'})).id,'linked');
});

test('paid invoices and sent Square invoices are read-only; unpaid local drafts stay editable',()=>{
 const check=invoice=>{
  const h=helperScope();
  h.squareDraft=invoice;
  vm.runInContext(guardSource+';globalThis.isLocked=financialsLocked();',h);
  return h.isLocked;
 };
 assert.equal(check({...original}),false);
 assert.equal(check({...original,status:'paid'}),true);
 assert.equal(check({...original,processor_metadata:{...original.processor_metadata,total_paid:1}}),true);
 assert.equal(check({...original,processor_metadata:{square_invoice_id:'sq-123'}}),true);
 assert.equal(check({...original,processor_metadata:{payment_link_id:'link-1'}}),true);
});

test('Save in Square uses the actual existing invoice ID, never a second invoice',()=>{
 assert.match(editor,/Save in Square/);
 assert.match(editor,/data-nxe-save-draft/);
 assert.match(editor,/const inv=await ensureLocalInvoice\(deposit\)/);
 assert.match(editor,/action:'create_draft',invoice_id:inv\.id/);
 assert.match(editor,/if\(squareDraft\)\{if\(financialsLocked\(\)\)/);
});
