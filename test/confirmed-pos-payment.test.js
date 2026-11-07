const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
async function confirm(overrides={},requestId='request',orderOverrides={}){
 let handler;const recorded=[],writes=[];
 const invoice={id:'inv',shop_id:'shop',job_id:'job',status:'partially_paid',total:100,processor_metadata:{pending_pos_payment:{id:'request',amount_cents:2500,created_at:'2026-11-07T00:00:00Z'}}};
 const rows={invoices:invoice,shop_members:{shop_id:'shop',role:'owner',status:'active'},shops:{slug:'autotechniques'},shop_payment_processors:{status:'connected'},payment_processor_credentials:{access_token:'test',location_id:'loc'}};
 const admin={rpc:async(name,args)=>{recorded.push({name,args});return {data:{...invoice,processor_metadata:{total_paid:25,remaining_calculated:75}},error:null}},from(table){const q={select(){return q},eq(){return q},update(v){writes.push({table,v});return q},upsert(v){writes.push({table,v});return q},maybeSingle:async()=>({data:rows[table]||null,error:null}),then(resolve){return Promise.resolve({data:rows[table]||null,error:null}).then(resolve)}};return q}};
 const source=fs.readFileSync('supabase/functions/square-invoice/index.ts','utf8').replace(/^import .*;\n/,'');
 vm.runInNewContext(stripTypeScriptTypes(source),{Response,Request,URL,crypto,console,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},createClient:(_u,_k,options)=>options?.global?{auth:{getUser:async()=>({data:{user:{id:'user'}}})}}:admin,fetch:async url=>url.includes('/orders/')?Response.json({order:{id:'order',location_id:'loc',tenders:[{id:'payment'}],...orderOverrides}}):Response.json({payment:{id:'payment',status:'COMPLETED',amount_money:{amount:2500,currency:'USD'},total_money:{amount:2500,currency:'USD'},location_id:'loc',note:'Payment reference: request',created_at:'2026-11-07T00:01:00Z',...overrides}})});
 const response=await handler(new Request('https://example.com',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'confirm_pos_payment',invoice_id:'inv',request_id:requestId,transaction_id:'order'})}));return {response,recorded,writes};
}
test('completed Square tap payment is verified and applied to the exact invoice',async()=>{
 const {response,recorded,writes}=await confirm();assert.equal(response.status,200);assert.equal(recorded.length,1);assert.deepEqual(JSON.parse(JSON.stringify(recorded[0])),{name:'record_received_invoice_payment',args:{p_invoice_id:'inv',p_amount:25,p_method:'square_pos',p_reference:'payment',p_request_id:'request'}});assert.ok(writes.some(x=>x.table==='payment_transactions'&&x.v.local_invoice_id==='inv'));
});
test('forged, wrong-amount, wrong-location, stale and incomplete callbacks never reduce the invoice balance',async()=>{
 for(const payment of [{status:'PENDING'},{amount_money:{amount:10000,currency:'USD'}},{location_id:'other'},{note:'unrelated payment'},{created_at:'2026-11-06T00:00:00Z'}]){const result=await confirm(payment);assert.equal(result.response.status,409);assert.equal(result.recorded.length,0);}
 const wrong=await confirm({},'other-request');assert.equal(wrong.response.status,409);assert.equal(wrong.recorded.length,0);
});

test('POS reference can be verified from the Square order line note',async()=>{const result=await confirm({note:''},'request',{line_items:[{note:'Payment reference: request'}]});assert.equal(result.response.status,200);});
