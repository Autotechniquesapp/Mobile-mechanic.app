import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
    const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const admin=createClient(supabaseUrl,secret,{auth:{persistSession:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return json({error:"Authentication required."},401);
    const {data:membership}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!membership)return json({error:"Active shop membership required."},403);
    const {data:shop,error:shopError}=await admin.from("shops").select("shop_id,name,stripe_customer_id,trial_expires_at,billing_status").eq("shop_id",membership.shop_id).single();
    if(shopError||!shop)return json({error:"Shop not found."},404);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"checkout");

    async function balance(){
      const {data:rows,error}=await admin.from("ai_credit_transactions").select("amount_cents,credit_bucket,kind").eq("shop_id",shop.shop_id);
      if(error)throw error;
      let promotional=0,purchased=0;
      for(const r of rows||[]){const n=Number(r.amount_cents||0);if(r.credit_bucket==="promotional")promotional+=n;else purchased+=n;}
      const trialEnd=shop.trial_expires_at?new Date(shop.trial_expires_at).getTime():0;
      const trialActive=Boolean(trialEnd&&Date.now()<trialEnd);
      if(!trialActive)promotional=0;
      return {balance_cents:Math.max(0,promotional)+purchased,promotional_cents:Math.max(0,promotional),purchased_cents:purchased,trial_active:trialActive,promotional_expires_at:shop.trial_expires_at||null};
    }

    if(action==="balance")return json({ok:true,...await balance()});
    if(action!=="checkout")return json({error:"Unknown AI credit action."},400);
    if(!["shop_owner","owner"].includes(String(membership.role)))return json({error:"Only the shop owner can purchase AI credit."},403);

    const amountCents=Number(body.amount_cents||0);
    const allowed=new Set([500,1000,2500,5000]);
    if(!allowed.has(amountCents))return json({error:"Choose an AI credit amount of $5, $10, $25, or $50."},400);
    const returnUrl=String(body.return_url||"https://mobile-mechanic.app/#billing");
    const stripeSecret=Deno.env.get("STRIPE_SECRET_KEY")||"";
    if(!stripeSecret)return json({error:"Stripe is not configured."},503);
    const stripe=new Stripe(stripeSecret);
    let customerId=shop.stripe_customer_id as string|null;
    if(!customerId){
      const customer=await stripe.customers.create({email:user.email||undefined,name:shop.name,metadata:{shop_id:shop.shop_id}});
      customerId=customer.id;
      await admin.from("shops").update({stripe_customer_id:customerId,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
    }
    const {data:topup,error:topupError}=await admin.from("ai_credit_topups").insert({shop_id:shop.shop_id,amount_cents:amountCents,status:"pending",created_by:user.id,metadata:{trial_expires_at:shop.trial_expires_at,billing_status:shop.billing_status}}).select("id").single();
    if(topupError||!topup)throw topupError||new Error("Could not create AI credit purchase.");
    const session=await stripe.checkout.sessions.create({
      mode:"payment",
      customer:customerId,
      line_items:[{quantity:1,price_data:{currency:"usd",unit_amount:amountCents,product_data:{name:`Mobile Mechanic AI — $${(amountCents/100).toFixed(0)} AI Credit`,description:"Prepaid AI usage credit. Does not start or change your app subscription."}}}],
      success_url:returnUrl,
      cancel_url:returnUrl,
      client_reference_id:shop.shop_id,
      metadata:{purchase_type:"ai_credit_topup",shop_id:shop.shop_id,amount_cents:String(amountCents),topup_id:topup.id}
    });
    await admin.from("ai_credit_topups").update({stripe_checkout_session_id:session.id,metadata:{trial_expires_at:shop.trial_expires_at,billing_status:shop.billing_status}}).eq("id",topup.id);
    return json({ok:true,url:session.url,amount_cents:amountCents,topup_id:topup.id});
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"AI credit checkout failed."},500);}
});