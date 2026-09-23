import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
function cents(v:unknown){return Math.max(0,Math.round(Number(v||0)*100));}
function lineAmount(item:any){
  const qty=Math.max(1,Number(item?.quantity??item?.qty??1));
  if(Number.isFinite(Number(item?.total)))return cents(item.total);
  if(Number.isFinite(Number(item?.amount)))return cents(item.amount);
  const unit=Number(item?.unit_price??item?.unitPrice??item?.price??item?.rate??0);
  return cents(unit*qty);
}
function lineDescription(item:any,i:number){return String(item?.description||item?.name||item?.title||item?.label||`Repair item ${i+1}`).slice(0,500);}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
    const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecret=Deno.env.get("STRIPE_SECRET_KEY")||"";
    if(!stripeSecret)return json({error:"Stripe is not configured yet."},503);
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return json({error:"Authentication required."},401);
    const {data:membership}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!membership)return json({error:"Active shop membership required."},403);
    if(!["shop_owner","owner","manager","service_writer"].includes(String(membership.role)))return json({error:"Your shop role cannot manage customer invoices."},403);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"status");
    const invoiceId=String(body.invoice_id||"");
    if(!invoiceId)return json({error:"invoice_id is required."},400);
    const {data:invoice,error:invoiceError}=await admin.from("invoices").select("*").eq("id",invoiceId).eq("shop_id",membership.shop_id).single();
    if(invoiceError||!invoice)return json({error:"Invoice not found."},404);
    const {data:shop}=await admin.from("shops").select("*").eq("shop_id",membership.shop_id).single();
    if(!shop?.stripe_connected_account_id)return json({error:"Connect the shop to Stripe before creating customer payment invoices.",code:"STRIPE_CONNECT_REQUIRED"},409);
    if(shop.stripe_connect_card_payments_status!=="active"&&!shop.stripe_connect_charges_enabled)return json({error:"Stripe onboarding is not complete yet. Finish Stripe setup before taking customer payments.",code:"STRIPE_CONNECT_NOT_ACTIVE"},409);
    const accountId=String(shop.stripe_connected_account_id);
    const stripe=new Stripe(stripeSecret);
    const requestOpts={stripeAccount:accountId};

    async function syncStripeInvoice(stripeInvoiceId:string){
      const si:any=await stripe.invoices.retrieve(stripeInvoiceId,{expand:["payments"]},requestOpts);
      const pi=typeof si.payment_intent==="string"?si.payment_intent:si.payment_intent?.id||null;
      const paidAt=si.status==="paid"?(si.status_transitions?.paid_at?new Date(si.status_transitions.paid_at*1000).toISOString():new Date().toISOString()):null;
      const updates:any={stripe_invoice_status:si.status,stripe_hosted_invoice_url:si.hosted_invoice_url||null,stripe_invoice_pdf:si.invoice_pdf||null,stripe_payment_intent_id:pi,stripe_last_error:null,updated_at:new Date().toISOString()};
      if(si.status==="paid"){updates.status="paid";updates.paid_at=paidAt;}
      await admin.from("invoices").update(updates).eq("id",invoice.id).eq("shop_id",membership.shop_id);
      return {stripe_invoice_id:si.id,status:si.status,hosted_invoice_url:si.hosted_invoice_url,invoice_pdf:si.invoice_pdf,amount_due:(si.amount_due||0)/100,amount_paid:(si.amount_paid||0)/100,paid_at:paidAt};
    }

    if(action==="status"){
      if(!invoice.stripe_invoice_id)return json({connected:true,created:false,status:invoice.status||"draft"});
      return json({connected:true,created:true,...await syncStripeInvoice(invoice.stripe_invoice_id)});
    }

    if(action==="send"){
      if(!invoice.stripe_invoice_id)return json({error:"Create the Stripe invoice first."},409);
      const sent:any=await stripe.invoices.sendInvoice(invoice.stripe_invoice_id,requestOpts);
      await admin.from("invoices").update({stripe_sent_at:new Date().toISOString(),stripe_invoice_status:sent.status,stripe_hosted_invoice_url:sent.hosted_invoice_url||null,stripe_invoice_pdf:sent.invoice_pdf||null,stripe_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id);
      return json({kind:"sent",...await syncStripeInvoice(sent.id)});
    }

    if(action!=="create")return json({error:"Unknown action."},400);
    if(invoice.stripe_invoice_id)return json({kind:"existing",...await syncStripeInvoice(invoice.stripe_invoice_id)});

    const {data:job}=await admin.from("jobs").select("id,customer_id").eq("id",invoice.job_id).eq("shop_id",membership.shop_id).maybeSingle();
    const {data:customer}=job?.customer_id?await admin.from("customers").select("*").eq("id",job.customer_id).eq("shop_id",membership.shop_id).maybeSingle():{data:null};
    if(!customer)return json({error:"This invoice needs a customer record before Stripe can create it."},409);

    let stripeCustomerId=customer.stripe_customer_id as string|null;
    if(!stripeCustomerId){
      const sc:any=await stripe.customers.create({name:customer.name||undefined,email:customer.email||undefined,phone:customer.phone||undefined,description:`Mobile Mechanic AI customer for ${shop.name}`,metadata:{shop_id:shop.shop_id,customer_id:customer.id}}, {...requestOpts,idempotencyKey:`mma-customer-${customer.id}`});
      stripeCustomerId=sc.id;
      await admin.from("customers").update({stripe_customer_id:stripeCustomerId,updated_at:new Date().toISOString()}).eq("id",customer.id).eq("shop_id",membership.shop_id);
    }

    const days=Math.min(90,Math.max(1,Number(body.days_until_due||7)));
    const createParams:any={customer:stripeCustomerId,collection_method:"send_invoice",days_until_due:days,auto_advance:false,description:`Automotive repair invoice — ${shop.name}`,metadata:{shop_id:shop.shop_id,invoice_id:invoice.id,job_id:invoice.job_id||"",platform:"mobile_mechanic_ai"}};
    if(shop.stripe_tax_enabled)createParams.automatic_tax={enabled:true};
    const si:any=await stripe.invoices.create(createParams,{...requestOpts,idempotencyKey:`mma-invoice-${invoice.id}`});

    let items=Array.isArray(invoice.line_items)?invoice.line_items:[];
    if(!items.length&&Number(invoice.total)>0)items=[{description:"Automotive repair services",total:Number(invoice.total)}];
    let createdAmount=0;
    for(let i=0;i<items.length;i++){
      const amount=lineAmount(items[i]);if(amount<=0)continue;createdAmount+=amount;
      await stripe.invoiceItems.create({customer:stripeCustomerId,invoice:si.id,amount,currency:"usd",description:lineDescription(items[i],i),metadata:{invoice_id:invoice.id,shop_id:shop.shop_id}},requestOpts);
    }
    if(createdAmount<=0)throw new Error("Invoice has no billable line items.");
    const finalized:any=await stripe.invoices.finalizeInvoice(si.id,{},requestOpts);
    await admin.from("invoices").update({stripe_invoice_id:finalized.id,stripe_connected_account_id:accountId,stripe_invoice_status:finalized.status,stripe_hosted_invoice_url:finalized.hosted_invoice_url||null,stripe_invoice_pdf:finalized.invoice_pdf||null,payment_links:{...(invoice.payment_links||{}),stripe:finalized.hosted_invoice_url||null},stripe_last_error:null,updated_at:new Date().toISOString()}).eq("id",invoice.id).eq("shop_id",membership.shop_id);
    return json({kind:"created",...await syncStripeInvoice(finalized.id)});
  }catch(err){
    console.error(err);
    return json({error:err instanceof Error?err.message:"Stripe shop invoicing failed."},500);
  }
});