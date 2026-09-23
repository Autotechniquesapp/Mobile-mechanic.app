import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
function cents(v:unknown){return Math.max(0,Math.round(Number(v||0)*100));}
function b64url(v:unknown){return btoa(JSON.stringify(v)).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');}
function paypalAssertion(clientId:string,merchantId:string){return `${b64url({alg:'none'})}.${b64url({iss:clientId,payer_id:merchantId})}.`;}

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
    const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:"Authentication required."},401);
    const {data:m}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!m)return json({error:"Active shop membership required."},403);
    if(!["shop_owner","owner","manager","service_writer"].includes(String(m.role)))return json({error:"Your shop role cannot manage customer invoices."},403);
    const body=await req.json().catch(()=>({}));const action=String(body.action||"status"),invoiceId=String(body.invoice_id||"");if(!invoiceId)return json({error:"invoice_id is required."},400);
    const {data:invoice}=await admin.from("invoices").select("*").eq("id",invoiceId).eq("shop_id",m.shop_id).single();if(!invoice)return json({error:"Invoice not found."},404);
    const {data:shop}=await admin.from("shops").select("*").eq("shop_id",m.shop_id).single();
    const {data:job}=invoice.job_id?await admin.from("jobs").select("id,customer_id").eq("id",invoice.job_id).eq("shop_id",m.shop_id).maybeSingle():{data:null};
    const {data:customer}=job?.customer_id?await admin.from("customers").select("*").eq("id",job.customer_id).eq("shop_id",m.shop_id).maybeSingle():{data:null};
    let provider=String(invoice.payment_processor||body.provider||"");
    if(!provider){const {data:def}=await admin.from("shop_payment_processors").select("provider,status").eq("shop_id",m.shop_id).eq("is_default",true).maybeSingle();provider=String(def?.provider||"stripe");}
    if(!["stripe","square","paypal"].includes(provider))return json({error:"Unsupported payment processor."},400);
    const {data:proc}=await admin.from("shop_payment_processors").select("*").eq("shop_id",m.shop_id).eq("provider",provider).maybeSingle();if(!proc||proc.status!=="connected")return json({error:`${provider} is not connected for this shop. Connect it in Settings first.`,code:"PROCESSOR_NOT_CONNECTED",provider},409);

    if(provider==="stripe"){
      const r=await fetch(`${supabaseUrl}/functions/v1/stripe-shop-invoice`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({action,invoice_id:invoiceId,days_until_due:Number(body.days_until_due||7)})});
      const d=await r.json().catch(()=>({}));if(!r.ok||d.error)return json({error:d.error||"Stripe invoice request failed.",provider},r.status||500);
      const url=d.hosted_invoice_url||invoice.stripe_hosted_invoice_url||null;
      await admin.from("invoices").update({payment_processor:"stripe",processor_payment_id:d.stripe_invoice_id||invoice.stripe_invoice_id||null,processor_status:d.status||invoice.stripe_invoice_status||invoice.status,processor_payment_url:url,processor_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id);
      return json({provider:"stripe",...d,payment_url:url});
    }

    if(provider==="square"){
      const appId=Deno.env.get("SQUARE_APPLICATION_ID")||"",appSecret=Deno.env.get("SQUARE_APPLICATION_SECRET")||"";
      if(!appId||!appSecret)return json({error:"Square developer credentials are not configured yet.",provider},503);
      const {data:cred}=await admin.from("payment_processor_credentials").select("*").eq("shop_id",m.shop_id).eq("provider","square").maybeSingle();if(!cred?.access_token)return json({error:"Reconnect Square in Settings.",provider},409);
      const env=String(cred.credential_metadata?.environment||Deno.env.get("SQUARE_ENVIRONMENT")||"sandbox").toLowerCase();const api=env==="production"?"https://connect.squareup.com":"https://connect.squareupsandbox.com";const oauth=env==="production"?"https://connect.squareup.com/oauth2":"https://connect.squareupsandbox.com/oauth2";
      let token=String(cred.access_token);
      if(cred.refresh_token&&cred.token_expires_at&&new Date(cred.token_expires_at).getTime()<Date.now()+48*3600*1000){const rr=await fetch(`${oauth}/token`,{method:"POST",headers:{"Square-Version":"2026-08-19","Content-Type":"application/json"},body:JSON.stringify({client_id:appId,client_secret:appSecret,grant_type:"refresh_token",refresh_token:cred.refresh_token})});const rd=await rr.json();if(!rr.ok||!rd.access_token)throw new Error(rd?.errors?.[0]?.detail||"Square token refresh failed.");token=rd.access_token;await admin.from("payment_processor_credentials").update({access_token:rd.access_token,refresh_token:rd.refresh_token||cred.refresh_token,token_expires_at:rd.expires_at||null,updated_at:new Date().toISOString()}).eq("id",cred.id);}
      const headers={Authorization:`Bearer ${token}`,"Square-Version":"2026-08-19","Content-Type":"application/json"};
      if(action==="status"){
        if(!invoice.processor_payment_id)return json({provider:"square",created:false,status:invoice.status||"draft",payment_url:invoice.processor_payment_url||null});
        const rr=await fetch(`${api}/v2/orders/${encodeURIComponent(invoice.processor_payment_id)}`,{headers});const rd=await rr.json();if(!rr.ok)throw new Error(rd?.errors?.[0]?.detail||"Square order status failed.");const state=String(rd?.order?.state||"OPEN");const paid=state==="COMPLETED";await admin.from("invoices").update({payment_processor:"square",processor_status:state,status:paid?"paid":invoice.status,paid_at:paid?(invoice.paid_at||new Date().toISOString()):invoice.paid_at,processor_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id);return json({provider:"square",created:true,status:paid?"paid":state.toLowerCase(),payment_url:invoice.processor_payment_url,amount_due:Number(invoice.total||0)});
      }
      if(action==="send")return json({provider:"square",status:invoice.processor_status||"open",payment_url:invoice.processor_payment_url,note:"Share the Square payment link from Mobile Mechanic AI."});
      if(action!=="create")return json({error:"Unknown action."},400);
      if(invoice.processor_payment_id&&invoice.payment_processor==="square")return json({provider:"square",kind:"existing",status:invoice.processor_status||"open",payment_url:invoice.processor_payment_url});
      const items=(Array.isArray(invoice.line_items)&&invoice.line_items.length?invoice.line_items:[{description:"Automotive repair services",total:Number(invoice.total||0)}]).map((x:any,i:number)=>({name:String(x.description||x.name||`Repair item ${i+1}`).slice(0,120),quantity:String(Math.max(1,Number(x.quantity||1))),base_price_money:{amount:Math.max(1,Math.round(cents(x.total??x.amount??x.price)/Math.max(1,Number(x.quantity||1)))),currency:"USD"}}));
      const payload:any={idempotency_key:`mma-${invoice.id}`,description:`${shop?.name||'Shop'} automotive repair invoice`,order:{location_id:cred.location_id,line_items:items}};
      if(customer?.email||customer?.phone)payload.pre_populated_data={...(customer?.email?{buyer_email:customer.email}:{}),...(customer?.phone?{buyer_phone_number:customer.phone}:{})};
      const rr=await fetch(`${api}/v2/online-checkout/payment-links`,{method:"POST",headers,body:JSON.stringify(payload)});const rd=await rr.json();if(!rr.ok||!rd.payment_link)throw new Error(rd?.errors?.[0]?.detail||"Square payment link creation failed.");const link=rd.payment_link;await admin.from("invoices").update({payment_processor:"square",processor_payment_id:link.order_id,processor_status:"OPEN",processor_payment_url:link.url,processor_metadata:{payment_link_id:link.id,environment:env},payment_links:{...(invoice.payment_links||{}),square:link.url},processor_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id);return json({provider:"square",kind:"created",status:"open",payment_url:link.url,amount_due:Number(invoice.total||0)});
    }

    const clientId=Deno.env.get("PAYPAL_CLIENT_ID")||"",clientSecret=Deno.env.get("PAYPAL_CLIENT_SECRET")||"",bn=Deno.env.get("PAYPAL_BN_CODE")||"";
    if(!clientId||!clientSecret)return json({error:"PayPal developer credentials are not configured yet.",provider},503);
    const {data:cred}=await admin.from("payment_processor_credentials").select("*").eq("shop_id",m.shop_id).eq("provider","paypal").maybeSingle();if(!cred?.merchant_id)return json({error:"Reconnect PayPal / Venmo in Settings.",provider},409);
    const env=String(cred.credential_metadata?.environment||Deno.env.get("PAYPAL_ENVIRONMENT")||"sandbox").toLowerCase();const api=env==="production"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";
    const basic=btoa(`${clientId}:${clientSecret}`);const tr=await fetch(`${api}/v1/oauth2/token`,{method:"POST",headers:{Authorization:`Basic ${basic}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});const td=await tr.json();if(!tr.ok||!td.access_token)throw new Error(td?.error_description||"PayPal authentication failed.");
    const ph:any={Authorization:`Bearer ${td.access_token}`,"Content-Type":"application/json","PayPal-Auth-Assertion":paypalAssertion(clientId,String(cred.merchant_id))};if(bn)ph["PayPal-Partner-Attribution-Id"]=bn;
    if(action==="status"){
      if(!invoice.processor_payment_id)return json({provider:"paypal",created:false,status:invoice.status||"draft",payment_url:invoice.processor_payment_url||null});
      const rr=await fetch(`${api}/v2/invoicing/invoices/${encodeURIComponent(invoice.processor_payment_id)}`,{headers:ph});const rd=await rr.json();if(!rr.ok)throw new Error(rd?.message||"PayPal invoice status failed.");const s=String(rd.status||"UNPAID");const paid=["PAID","MARKED_AS_PAID","PAID_EXTERNAL"].includes(s);const url=rd?.detail?.metadata?.recipient_view_url||rd?.links?.find?.((x:any)=>x.rel==="payer-view")?.href||invoice.processor_payment_url||null;await admin.from("invoices").update({payment_processor:"paypal",processor_status:s,processor_payment_url:url,status:paid?"paid":invoice.status,paid_at:paid?(invoice.paid_at||new Date().toISOString()):invoice.paid_at,processor_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id);return json({provider:"paypal",created:true,status:paid?"paid":s.toLowerCase(),payment_url:url,amount_due:Number(invoice.total||0)});
    }
    if(action==="send"){
      if(!invoice.processor_payment_id)return json({error:"Create the PayPal invoice first."},409);const rr=await fetch(`${api}/v2/invoicing/invoices/${encodeURIComponent(invoice.processor_payment_id)}/send`,{method:"POST",headers:ph,body:JSON.stringify({send_to_invoicer:false,send_to_recipient:true})});if(!rr.ok){const rd=await rr.json();throw new Error(rd?.message||"PayPal could not send the invoice.");}return json({provider:"paypal",kind:"sent",status:"sent",payment_url:invoice.processor_payment_url});
    }
    if(action!=="create")return json({error:"Unknown action."},400);
    if(invoice.processor_payment_id&&invoice.payment_processor==="paypal")return json({provider:"paypal",kind:"existing",status:invoice.processor_status||"unpaid",payment_url:invoice.processor_payment_url});
    const primaryEmail=String(cred.credential_metadata?.primary_email||"");if(!primaryEmail)return json({error:"PayPal connected, but its merchant email has not been synchronized yet. Reconnect PayPal after partner setup is complete.",provider},409);
    const today=new Date().toISOString().slice(0,10);const items=(Array.isArray(invoice.line_items)&&invoice.line_items.length?invoice.line_items:[{description:"Automotive repair services",total:Number(invoice.total||0)}]).map((x:any,i:number)=>{const qty=Math.max(1,Number(x.quantity||1));const total=Number(x.total??x.amount??x.price??0);return {name:String(x.description||x.name||`Repair item ${i+1}`).slice(0,200),quantity:String(qty),unit_amount:{currency_code:"USD",value:(Math.max(0,total)/qty).toFixed(2)}};});
    const recipient:any={billing_info:{name:{full_name:customer?.name||"Customer"}}};if(customer?.email)recipient.billing_info.email_address=customer.email;
    const draft={detail:{invoice_number:`MMA-${String(invoice.id).slice(0,8).toUpperCase()}`,reference:String(invoice.job_id||invoice.id),invoice_date:today,currency_code:"USD",note:`Automotive repair invoice from ${shop?.name||'your mechanic'}.`,payment_term:{term_type:"DUE_ON_RECEIPT"}},invoicer:{business_name:{business_name:shop?.name||"Repair Shop"},email_address:primaryEmail},primary_recipients:[recipient],items};
    ph["PayPal-Request-Id"]=`mma-${invoice.id}`;const cr=await fetch(`${api}/v2/invoicing/invoices`,{method:"POST",headers:ph,body:JSON.stringify(draft)});const cd=await cr.json();if(!cr.ok||!cd.id)throw new Error(cd?.message||cd?.details?.[0]?.description||"PayPal invoice creation failed.");
    const sr=await fetch(`${api}/v2/invoicing/invoices/${encodeURIComponent(cd.id)}/send`,{method:"POST",headers:ph,body:JSON.stringify({send_to_invoicer:false,send_to_recipient:false})});if(!sr.ok){const sd=await sr.json();throw new Error(sd?.message||"PayPal invoice could not be made payable.");}
    const gr=await fetch(`${api}/v2/invoicing/invoices/${encodeURIComponent(cd.id)}`,{headers:ph});const gd=await gr.json();const url=gd?.detail?.metadata?.recipient_view_url||gd?.links?.find?.((x:any)=>x.rel==="payer-view")?.href||null;await admin.from("invoices").update({payment_processor:"paypal",processor_payment_id:cd.id,processor_status:gd?.status||"UNPAID",processor_payment_url:url,processor_metadata:{environment:env},payment_links:{...(invoice.payment_links||{}),paypal:url},processor_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id);return json({provider:"paypal",kind:"created",status:String(gd?.status||"UNPAID").toLowerCase(),payment_url:url,amount_due:Number(invoice.total||0)});
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Shop payment request failed."},500);}
});