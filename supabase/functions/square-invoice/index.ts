import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
function cents(v:unknown){return Math.max(0,Math.round(Number(v||0)*100));}
function splitName(name:string){const p=String(name||'').trim().split(/\s+/).filter(Boolean);return {given_name:p[0]||'Customer',family_name:p.slice(1).join(' ')||undefined};}
function dueDate(days=7){const d=new Date();d.setUTCDate(d.getUTCDate()+Math.max(0,days));return d.toISOString().slice(0,10);}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
    const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return json({error:"Authentication required."},401);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"create");
    const invoiceId=String(body.invoice_id||"");
    if(!invoiceId)return json({error:"invoice_id is required."},400);

    const {data:invoice}=await admin.from("invoices").select("*").eq("id",invoiceId).maybeSingle();
    if(!invoice)return json({error:"Invoice not found."},404);
    const {data:m}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("shop_id",invoice.shop_id).eq("status","active").maybeSingle();
    if(!m)return json({error:"Invoice not found."},404);
    if(!["shop_owner","owner","manager","service_writer"].includes(String(m.role)))return json({error:"Your shop role cannot create customer invoices."},403);
    const {data:proc}=await admin.from("shop_payment_processors").select("*").eq("shop_id",m.shop_id).eq("provider","square").maybeSingle();
    if(!proc||proc.status!=="connected")return json({error:"Square is not connected for this shop."},409);
    const {data:cred}=await admin.from("payment_processor_credentials").select("*").eq("shop_id",m.shop_id).eq("provider","square").maybeSingle();
    if(!cred?.access_token||!cred?.location_id)return json({error:"Reconnect Square in Settings."},409);

    const appId=Deno.env.get("SQUARE_APPLICATION_ID")||"",appSecret=Deno.env.get("SQUARE_APPLICATION_SECRET")||"";
    const env=String(cred.credential_metadata?.environment||Deno.env.get("SQUARE_ENVIRONMENT")||"production").toLowerCase();
    const api=env==="sandbox"?"https://connect.squareupsandbox.com":"https://connect.squareup.com";
    const oauth=env==="sandbox"?"https://connect.squareupsandbox.com/oauth2":"https://connect.squareup.com/oauth2";
    const dashboardWebUrl=env==="sandbox"?"https://squareupsandbox.com/dashboard":"https://squareup.com/dashboard/sales/invoices";
    const squareInvoicesAppUrl=env==="sandbox"?dashboardWebUrl:"intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.squareup.invoicesapp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.squareup.invoicesapp;end";
    let token=String(cred.access_token);
    if(cred.refresh_token&&cred.token_expires_at&&new Date(cred.token_expires_at).getTime()<Date.now()+48*3600*1000){
      if(!appId||!appSecret)return json({error:"Square application credentials are missing."},503);
      const rr=await fetch(`${oauth}/token`,{method:"POST",headers:{"Square-Version":"2026-08-19","Content-Type":"application/json"},body:JSON.stringify({client_id:appId,client_secret:appSecret,grant_type:"refresh_token",refresh_token:cred.refresh_token})});
      const rd=await rr.json();if(!rr.ok||!rd.access_token)throw new Error(rd?.errors?.[0]?.detail||"Square token refresh failed.");
      token=rd.access_token;await admin.from("payment_processor_credentials").update({access_token:rd.access_token,refresh_token:rd.refresh_token||cred.refresh_token,token_expires_at:rd.expires_at||null,updated_at:new Date().toISOString()}).eq("id",cred.id);
    }
    const headers={Authorization:`Bearer ${token}`,"Square-Version":"2026-08-19","Content-Type":"application/json"};
    const meta={...(invoice.processor_metadata||{})};

    if(action==="status"){
      const sqid=String(meta.square_invoice_id||invoice.processor_payment_id||"");
      if(!sqid)return json({provider:"square",created:false,status:invoice.status||"draft",dashboard_url:squareInvoicesAppUrl,dashboard_web_url:dashboardWebUrl});
      const rr=await fetch(`${api}/v2/invoices/${encodeURIComponent(sqid)}`,{headers});const rd=await rr.json();
      if(!rr.ok||!rd.invoice)throw new Error(rd?.errors?.[0]?.detail||"Square invoice status failed.");
      const sq=rd.invoice,s=String(sq.status||"DRAFT");
      const local=s==="DRAFT"?"draft":s==="PAID"?"paid":s==="PARTIALLY_PAID"?"partially_paid":"sent";
      await admin.from("invoices").update({payment_processor:"square",processor_payment_id:sq.id,processor_status:s,processor_payment_url:sq.public_url||invoice.processor_payment_url||null,status:local,paid_at:s==="PAID"?(invoice.paid_at||new Date().toISOString()):invoice.paid_at,processor_metadata:{...meta,square_invoice_id:sq.id,square_order_id:sq.order_id,square_invoice_number:sq.invoice_number||meta.square_invoice_number,version:sq.version,kind:"square_invoice",environment:env},payment_links:{...(invoice.payment_links||{}),...(sq.public_url?{square:sq.public_url}:{})},processor_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id);
      return json({provider:"square",kind:"invoice",status:s.toLowerCase(),invoice_number:sq.invoice_number||null,payment_url:sq.public_url||null,dashboard_url:squareInvoicesAppUrl,dashboard_web_url:dashboardWebUrl,amount_due:Number(invoice.total||0)});
    }

    if(action!=="create"&&action!=="create_draft")return json({error:"Unknown action."},400);
    if(meta.square_invoice_id||meta.kind==="square_invoice")return json({provider:"square",kind:"existing_invoice",status:String(invoice.processor_status||"draft").toLowerCase(),invoice_number:meta.square_invoice_number||null,payment_url:invoice.processor_payment_url||null,dashboard_url:squareInvoicesAppUrl,dashboard_web_url:dashboardWebUrl});

    const {data:job}=invoice.job_id?await admin.from("jobs").select("id,customer_id").eq("id",invoice.job_id).eq("shop_id",m.shop_id).maybeSingle():{data:null};
    const {data:customer}=job?.customer_id?await admin.from("customers").select("*").eq("id",job.customer_id).eq("shop_id",m.shop_id).maybeSingle():{data:null};
    const {data:shop}=await admin.from("shops").select("*").eq("shop_id",m.shop_id).single();

    let squareCustomerId=String(meta.square_customer_id||"");
    if(!squareCustomerId){
      const names=splitName(String(customer?.name||"Customer"));
      const cp:any={idempotency_key:`mma-customer-${customer?.id||invoice.id}`,...names,reference_id:String(customer?.id||invoice.id)};
      if(customer?.email)cp.email_address=customer.email;if(customer?.phone)cp.phone_number=customer.phone;
      const cr=await fetch(`${api}/v2/customers`,{method:"POST",headers,body:JSON.stringify(cp)});const cd=await cr.json();
      if(!cr.ok||!cd.customer?.id)throw new Error(cd?.errors?.[0]?.detail||"Square customer creation failed.");
      squareCustomerId=cd.customer.id;
    }

    const src=Array.isArray(invoice.line_items)&&invoice.line_items.length?invoice.line_items:[{description:"Automotive repair services",amount:Number(invoice.subtotal||invoice.total||0),quantity:1}];
    const orderItems:any[]=[];
    for(let i=0;i<src.length;i++){
      const x:any=src[i],qty=Math.max(1,Number(x.quantity||1)),lineTotal=Number(x.amount??x.total??x.price??0),unit=Number(x.unit_price??(lineTotal/qty));
      if(!(unit>0))continue;
      orderItems.push({name:String(x.description||x.name||`Repair item ${i+1}`).slice(0,120),quantity:String(qty),base_price_money:{amount:Math.max(1,cents(unit)),currency:"USD"}});
    }
    const tax=Number(invoice.tax||0);if(tax>0)orderItems.push({name:"Sales tax",quantity:"1",base_price_money:{amount:cents(tax),currency:"USD"}});
    if(!orderItems.length)return json({error:"This invoice has no priced line items."},409);

    let orderId=String(meta.square_order_id||"");
    if(!orderId){
      const or=await fetch(`${api}/v2/orders`,{method:"POST",headers,body:JSON.stringify({idempotency_key:`mma-order-${invoice.id}`,order:{location_id:cred.location_id,reference_id:String(invoice.id),customer_id:squareCustomerId,line_items:orderItems}})});const od=await or.json();
      if(!or.ok||!od.order?.id)throw new Error(od?.errors?.[0]?.detail||"Square order creation failed.");orderId=od.order.id;
    }

    const invPayload={idempotency_key:`mma-invoice-${invoice.id}`,invoice:{location_id:cred.location_id,order_id:orderId,primary_recipient:{customer_id:squareCustomerId},delivery_method:"SHARE_MANUALLY",payment_requests:[{request_type:"BALANCE",due_date:dueDate(Number(body.days_until_due||7)),tipping_enabled:false,automatic_payment_source:"NONE"}],accepted_payment_methods:{card:true,square_gift_card:false,bank_account:false,buy_now_pay_later:false,cash_app_pay:true},title:"Automotive Repair",description:`${shop?.name||"Repair Shop"} repair invoice`}};
    const ir=await fetch(`${api}/v2/invoices`,{method:"POST",headers,body:JSON.stringify(invPayload)});const id=await ir.json();
    if(!ir.ok||!id.invoice?.id)throw new Error(id?.errors?.[0]?.detail||"Square invoice creation failed.");
    const sq=id.invoice;
    await admin.from("invoices").update({payment_processor:"square",processor_payment_id:sq.id,processor_status:"DRAFT",processor_payment_url:null,status:"draft",processor_metadata:{...meta,source:meta.source||"additional_work_estimate",kind:"square_invoice",environment:env,square_customer_id:squareCustomerId,square_order_id:orderId,square_invoice_id:sq.id,square_invoice_number:sq.invoice_number||null,version:sq.version},processor_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id);
    return json({provider:"square",kind:"invoice_draft",status:"draft",invoice_number:sq.invoice_number||null,dashboard_url:squareInvoicesAppUrl,dashboard_web_url:dashboardWebUrl,amount_due:Number(invoice.total||0),message:"Draft created in Square. Review it in the Square Invoices app before sending."});
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Square invoice request failed."},500);}
});