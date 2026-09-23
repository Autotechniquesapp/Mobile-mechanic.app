import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const periodEnd=(sub:any)=>sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;
const subRef=(obj:any)=>{const x=obj?.subscription ?? obj?.parent?.subscription_details?.subscription;return typeof x==="string"?x:x?.id||null;};
const customerRef=(obj:any)=>{const x=obj?.customer;return typeof x==="string"?x:x?.id||null;};

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const stripeSecret=Deno.env.get("STRIPE_SECRET_KEY")||"";
  const signingSecret=Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET")||"";
  if(!stripeSecret||!signingSecret)return json({error:"Stripe webhook secrets are not configured."},503);
  const signature=req.headers.get("Stripe-Signature");
  if(!signature)return json({error:"Missing Stripe signature."},400);
  const body=await req.text();
  const stripe=new Stripe(stripeSecret);
  let event:Stripe.Event;
  try{event=await stripe.webhooks.constructEventAsync(body,signature,signingSecret,undefined,Stripe.createSubtleCryptoProvider());}
  catch(err){console.error("Stripe signature verification failed",err);return json({error:"Invalid signature."},400);}

  const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
  const secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const admin=createClient(supabaseUrl,secret,{auth:{persistSession:false}});
  const obj:any=event.data.object;
  let shopId=obj?.metadata?.shop_id || obj?.client_reference_id || null;
  const subscriptionId=subRef(obj) || (event.type.startsWith("customer.subscription.")?obj?.id:null);
  const customerId=customerRef(obj);
  if(!shopId&&subscriptionId){const {data}=await admin.from("shops").select("shop_id").eq("stripe_subscription_id",subscriptionId).maybeSingle();shopId=data?.shop_id||null;}
  if(!shopId&&customerId){const {data}=await admin.from("shops").select("shop_id").eq("stripe_customer_id",customerId).maybeSingle();shopId=data?.shop_id||null;}

  const {error:insertError}=await admin.from("stripe_events").insert({event_id:event.id,event_type:event.type,shop_id:shopId,payload:event as any});
  if(insertError?.code==="23505")return json({ok:true,duplicate:true});
  if(insertError)console.error("Could not record Stripe event",insertError);

  try{
    if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded"){
      const session:any=obj;
      const purchaseType=String(session.metadata?.purchase_type||"");
      if(purchaseType==="ai_credit_topup"){
        const topupId=String(session.metadata?.topup_id||"");
        const amountCents=Number(session.metadata?.amount_cents||0);
        const allowed=new Set([500,1000,2500,5000]);
        if(!shopId||!topupId||!allowed.has(amountCents))throw new Error("Invalid AI credit top-up metadata.");
        if(session.payment_status==="paid"){
          const paymentIntent=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id||null;
          const {data:topup,error:topupError}=await admin.from("ai_credit_topups").select("id,shop_id,amount_cents,status").eq("id",topupId).eq("shop_id",shopId).single();
          if(topupError||!topup)throw topupError||new Error("AI credit top-up not found.");
          if(Number(topup.amount_cents)!==amountCents)throw new Error("AI credit top-up amount mismatch.");
          await admin.from("ai_credit_topups").update({status:"paid",stripe_payment_intent_id:paymentIntent,paid_at:new Date().toISOString()}).eq("id",topupId);
          const {error:creditError}=await admin.from("ai_credit_transactions").insert({shop_id:shopId,kind:"purchase",amount_cents:amountCents,source:"stripe_ai_credit_topup",reference_id:`stripe_checkout:${session.id}`,metadata:{topup_id:topupId,stripe_checkout_session_id:session.id,stripe_payment_intent_id:paymentIntent}});
          if(creditError&&creditError.code!=="23505")throw creditError;
          await admin.from("shops").update({stripe_customer_id:customerRef(session)||undefined,billing_last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",shopId);
        }
      }else{
        const sid=shopId;
        if(sid)await admin.from("shops").update({stripe_customer_id:customerRef(session),stripe_subscription_id:subRef(session),stripe_checkout_session_id:session.id,plan:session.metadata?.plan||undefined,billing_last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",sid);
      }
    }
    if(event.type.startsWith("customer.subscription.")){
      const sub:any=obj;const sid=shopId||sub.metadata?.shop_id;const pe=periodEnd(sub);
      if(sid){
        let billing=sub.status;
        if(sub.status==="active")billing="active";
        if(event.type==="customer.subscription.deleted")billing="canceled";
        await admin.from("shops").update({stripe_customer_id:customerRef(sub),stripe_subscription_id:sub.id,stripe_subscription_status:sub.status,billing_status:billing,plan:sub.metadata?.plan||undefined,stripe_current_period_end:pe?new Date(pe*1000).toISOString():null,stripe_cancel_at_period_end:Boolean(sub.cancel_at_period_end),billing_last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",sid);
      }
    }
    if(["invoice.payment_failed","invoice.payment_action_required"].includes(event.type)){
      if(shopId)await admin.from("shops").update({billing_status:"past_due",billing_last_error:event.type==="invoice.payment_failed"?"Stripe invoice payment failed.":"Stripe payment requires customer action.",updated_at:new Date().toISOString()}).eq("shop_id",shopId);
    }
    if(event.type==="invoice.paid"&&shopId){
      const sid=subRef(obj);
      if(sid){try{const sub:any=await stripe.subscriptions.retrieve(sid);const pe=periodEnd(sub);await admin.from("shops").update({stripe_subscription_status:sub.status,billing_status:sub.status==="active"?"active":sub.status,stripe_current_period_end:pe?new Date(pe*1000).toISOString():null,billing_last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",shopId);}catch(err){console.warn("Could not refresh paid subscription",err);}}
    }
    await admin.from("stripe_events").update({processed_at:new Date().toISOString(),processing_error:null}).eq("event_id",event.id);
    return json({ok:true});
  }catch(err){
    console.error("Stripe event processing failed",err);
    await admin.from("stripe_events").update({processed_at:new Date().toISOString(),processing_error:err instanceof Error?err.message:String(err)}).eq("event_id",event.id);
    return json({error:"Webhook processing failed."},500);
  }
});