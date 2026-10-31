const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

const server=fs.readFileSync('supabase/functions/square-invoice/index.ts','utf8');
const editor=fs.readFileSync('next-invoice.js','utf8');

async function runEmail({status='DRAFT',email='customer@example.com',squareEmail='other@example.com',orderCents=37940}={}){
  const invoice={id:'local-1',shop_id:'shop-1',job_id:null,total:379.4,
    status:'draft',processor_status:status,processor_metadata:{square_invoice_id:'sq-1',square_customer_id:'cust-1'}};
  const requests=[];
  let handler;
  const customer={id:'cust-1',version:3,email_address:squareEmail};
  const makeInvoice=(state,version,method='SHARE_MANUALLY')=>({
    id:'sq-1',order_id:'ord-1',status:state,version,invoice_number:'0000007',
    primary_recipient:{customer_id:'cust-1',email_address:customer.email_address},
    delivery_method:method,
    payment_requests:[{request_type:'BALANCE',computed_amount_money:{amount:37940,currency:'USD'},total_completed_amount_money:{amount:0}}],
    public_url:state==='DRAFT'?null:'https://squareup.com/pay-invoice/sample',
  });
  let remote=makeInvoice(status,0);
  const rows={
    invoices:invoice,shop_members:{shop_id:'shop-1',role:'owner',status:'active'},
    shops:{name:'AutoTechniques'},shop_payment_processors:{status:'connected'},
    payment_processor_credentials:{location_id:'loc',access_token:'token',credential_metadata:{environment:'sandbox'}},
  };
  const admin={from(table){
    const q={select(){return q},eq(){return q},upsert(){return q},update(patch){if(table==='invoices')Object.assign(invoice,patch);return q},
      maybeSingle:async()=>({data:rows[table]||null,error:null}),
      single:async()=>({data:rows[table]||null,error:null}),
      then(resolve){return Promise.resolve({data:null,error:null}).then(resolve)}
    };return q;
  }};
  const fetch=async (input,init={})=>{
    const url=new URL(input),method=init.method||'GET',body=init.body?JSON.parse(init.body):{};
    requests.push({url:url.pathname,method,body});
    if(url.pathname==='/v2/invoices/sq-1'&&method==='GET')return Response.json({invoice:remote});
    if(url.pathname==='/v2/orders/ord-1'&&method==='GET')return Response.json({order:{id:'ord-1',total_money:{amount:orderCents,currency:'USD'}}});
    if(url.pathname==='/v2/customers/cust-1'&&method==='GET')return Response.json({customer});
    if(url.pathname==='/v2/customers/cust-1'&&method==='PUT'){
      customer.email_address=body.email_address;customer.version++;return Response.json({customer});}
    if(url.pathname==='/v2/invoices/sq-1'&&method==='PUT'){
      remote=makeInvoice('DRAFT',remote.version+1,body.invoice.delivery_method);
      return Response.json({invoice:remote});}
    if(url.pathname==='/v2/invoices/sq-1/publish'&&method==='POST'){
      remote=makeInvoice('UNPAID',remote.version+1,remote.delivery_method);
      return Response.json({invoice:remote});}
    throw Error('Unexpected Square endpoint '+method+' '+url.pathname);
  };
  vm.runInNewContext(stripTypeScriptTypes(server.replace(/^import .*;\n/,'')),{
    Response,Request,URL,crypto,console,fetch,
    Deno:{env:{get:name=>name==='SQUARE_ENVIRONMENT'?'sandbox':'value'},serve:fn=>handler=fn},
    createClient:(_url,_key,opts)=>opts?.global?{auth:{getUser:async()=>({data:{user:{id:'user-1'}}})}}:admin,
  });
  const response=await handler(new Request('https://example.com/functions/v1/square-invoice',{
    method:'POST',headers:{Authorization:'Bearer test'},
    body:JSON.stringify({action:'email',invoice_id:invoice.id,recipient_email:email}),
  }));
  return {status:response.status,body:await response.json(),requests,invoice,customer};
}

test('Save Draft is separate from explicit email send and Open in Square',()=>{
  assert.match(editor,/data-nxe-save-draft/);
  assert.match(editor,/Save Draft in Square/);
  assert.match(editor,/data-nxe-email-square/);
  assert.match(editor,/Email Customer to Pay/);
  assert.match(editor,/data-nxe-open-square-dashboard/);
  assert.match(editor,/action:'create_draft',invoice_id:inv\.id/);
  assert.match(editor,/action:'email',invoice_id:squareDraft\.id/);
});

test('Square emails the confirmed customer only after explicit send, and publishes payment link',async()=>{
  const result=await runEmail();
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.ok,true);
  assert.equal(result.body.recipient_email,'customer@example.com');
  const calls=result.requests.map(x=>x.method+' '+x.url);
  assert.deepEqual(calls,[
    'GET /v2/invoices/sq-1','GET /v2/orders/ord-1','GET /v2/customers/cust-1',
    'PUT /v2/customers/cust-1','PUT /v2/invoices/sq-1','POST /v2/invoices/sq-1/publish'
  ]);
  assert.equal(result.requests[4].body.invoice.delivery_method,'EMAIL');
  assert.equal(result.requests[5].body.version,1);
  assert.equal(result.body.payment_url,'https://squareup.com/pay-invoice/sample');
  assert.equal(result.invoice.processor_status,'UNPAID');
  assert.equal(result.invoice.processor_metadata.recipient_email,'customer@example.com');
});

test('invalid email never calls Square endpoints',async()=>{
 const result=await runEmail({email:'not-an-email'});
 assert.equal(result.status,400);
 assert.equal(result.requests.length,0);
});

test('already published invoices do not get accidentally emailed again',async()=>{
 const result=await runEmail({status:'UNPAID',squareEmail:'customer@example.com'});
 assert.equal(result.status,409);
 assert.ok(!result.requests.some(x=>x.method==='PUT'||x.method==='POST'));
});

test('wrong Square tax blocks customer email even if the draft exists',async()=>{
 const result=await runEmail({orderCents:40460});
 assert.equal(result.status,409);
 assert.equal(result.body.square_total,404.6);
 assert.equal(result.body.expected_total,379.4);
 assert.match(result.body.error,/extra sales tax/i);
 assert.ok(!result.requests.some(x=>x.method==='PUT'||x.method==='POST'));
});
