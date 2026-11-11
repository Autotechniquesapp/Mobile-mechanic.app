const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sandbox={window:{},Intl,Date};
vm.runInNewContext(fs.readFileSync('thermal-receipt.js','utf8'),sandbox);
const {rowsFor,paginate}=sandbox.window.MobileMechanicThermalReceipt;
const data={invoice:{id:'invoice-123',created_at:'2026-11-11T18:00:00Z',status:'partial',total:350,tax:0,subtotal:350,line_items:[{description:'Water pump replacement',quantity:1,amount:350}],processor_metadata:{received_payments:[{method:'zelle',amount:100}]}},shop:{name:'AutoTechniques'},job:{customerName:'Chris',vehicle:{year:2020,make:'Ram',model:'3500'}},paid:100,balance:250};
test('receipt preserves partial payment totals and payment method',()=>{
 const text=rowsFor(data,s=>s.length*10).map(r=>r.text).join('\n');
 assert.match(text,/Total: \$350\.00/);assert.match(text,/Paid: \$100\.00/);
 assert.match(text,/Remaining balance: \$250\.00/);assert.match(text,/Zelle: \$100\.00/);
 assert.match(text,/Water pump replacement/);assert.doesNotMatch(text,/Status: Paid/);
});
test('long descriptions and warranties fit and paginate without losing text',()=>{
 const warranty='Warranty'.repeat(300),rows=rowsFor({...data,warranty},s=>s.length*12);
 assert.ok(rows.every(r=>r.text.length*12<=536));
 assert.ok(rows.map(r=>r.text).join('').includes(warranty));
 const pages=paginate(rows);assert.ok(pages.length>1);
 assert.equal(pages.flat().length,rows.length);
 assert.ok(pages.every(page=>page.reduce((n,r)=>n+Math.ceil(r.size*1.4),0)<=1530));
});
test('stale payment notice and changed signature stay visible',()=>{
 const text=rowsFor({...data,syncNote:'Square could not be refreshed.',signatureChanged:true,signed:{signature_name:'Joe',signed_at:'2026-11-11T18:00:00Z',snapshot:{invoice:{total:300}}}},s=>s.length*8).map(r=>r.text).join('\n');
 assert.match(text,/Square could not be refreshed/);assert.match(text,/Historical signature/);assert.match(text,/Accepted total: \$300\.00/);
});
test('image export offers PNG downloads and releases URLs when closed',async()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<body><div data-invoice-print-picker></div></body>',{runScripts:'outside-only'}),w=dom.window;
 const released=[],drawn=[];
 w.URL.createObjectURL=()=>`blob:receipt-${Math.random()}`;
 w.URL.revokeObjectURL=url=>released.push(url);
 w.HTMLCanvasElement.prototype.getContext=()=>({measureText:s=>({width:s.length*12}),fillRect(){},fillText:s=>drawn.push(s)});
 w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new w.Blob(['png'],{type:'image/png'}));};
 w.eval(fs.readFileSync('thermal-receipt.js','utf8'));
 await w.MobileMechanicThermalReceipt.open(data);
 assert.equal(w.document.querySelector('[data-invoice-print-picker]'),null);
 const links=[...w.document.querySelectorAll('a[download]')];assert.ok(links.length>0);
 assert.ok(links.every(a=>a.download.endsWith('.png')));
 assert.ok(drawn.includes('Remaining balance: $250.00'));
 w.document.querySelector('[aria-label="Close receipt"]').click();
 assert.equal(w.document.querySelector('[data-thermal-receipt]'),null);
 assert.equal(released.length,links.length);w.close();
});
