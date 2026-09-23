import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const STRIPE_VERSION="2026-08-26.preview";

function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
function secret(){const key=Deno.env.get("STRIPE_SECRET_KEY")||"";if(!key)throw new Error("Stripe is not configured yet.");return key;}
async function stripe(path:string,method="GET",body?:unknown){
  const res=await fetch(`https://api.stripe.com${path}`,{method,headers:{Authorization:`Bearer ${secret()}`,"Stripe-Version":STRIPE_VERSION,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||data?.message||`Stripe request failed (${res.status}).`);
  return data;
}
async function stripeAccount(path:string,accountId:string,method="GET",body?:unknown){
  const res=await fetch(`https://api.stripe.com${path}`,{method,headers:{Authorization:`Bearer ${secret()}`,"Stripe-Account":accountId,"Content-Type":"application/x-www-form-urlencoded"},body:body?new URLSearchParams(body as Record<string,string>).toString():undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||`Connected Stripe request failed (${res.status}).`);
  return data;
}

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
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return json({error:"Authentication required."},401);
    const {data:membership}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").in("role",["shop_owner","owner"]).limit(1).maybeSingle();
    if(!membership)return json({error:"Only the shop owner can manage Stripe payments."},403);
    const {data:shop,error:shopError}=await admin.from("shops").select("*").eq("shop_id",membership.shop_id).single();
    if(shopError||!shop)return json({error:"Shop not found."},404);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"status");
    const returnUrl=String(body.return_url||"https://mobile-mechanic.app/#settings");
    const refreshUrl=String(body.refresh_url||"https://mobile-mechanic.app/#settings");
    let accountId=shop.stripe_connected_account_id as string|null;

    async function taxStatus(){
      if(!accountId)return {tax_status:"not_connected",tax_enabled:false,tax_ready:false};
      try{
        const settings=await stripeAccount("/v1/tax/settings",accountId);
        const status=String(settings?.status||"pending");
        const ready=status==="active";
        if(!ready&&shop.stripe_tax_enabled){
          await admin.from("shops").update({stripe_tax_enabled:false,stripe_tax_status:status,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
        }else{
          await admin.from("shops").update({stripe_tax_status:status,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
        }
        return {tax_status:status,tax_enabled:ready?Boolean(shop.stripe_tax_enabled):false,tax_ready:ready,defaults:settings?.defaults||null,head_office:settings?.head_office||null};
      }catch(err){
        const message=err instanceof Error?err.message:String(err);
        await admin.from("shops").update({stripe_tax_status:"not_configured",stripe_tax_enabled:false,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
        return {tax_status:"not_configured",tax_enabled:false,tax_ready:false,tax_error:message};
      }
    }

    async function sync(){
      if(!accountId)return {connected:false,status:"not_connected",tax_status:"not_connected",tax_enabled:false,tax_ready:false};
      const qs=new URLSearchParams();
      ["configuration.merchant","requirements","future_requirements","defaults"].forEach(v=>qs.append("include[]",v));
      const acct=await stripe(`/v2/core/accounts/${encodeURIComponent(accountId)}?${qs.toString()}`);
      const card=acct?.configuration?.merchant?.capabilities?.card_payments?.status||"pending";
      const payouts=acct?.configuration?.merchant?.capabilities?.stripe_balance?.payouts?.status||"pending";
      const entries=Array.isArray(acct?.requirements?.entries)?acct.requirements.entries:[];
      const due=entries.filter((e:any)=>["currently_due","past_due"].includes(e?.minimum_deadline?.status)||e?.requested_reasons?.some?.((r:any)=>["currently_due","past_due"].includes(r?.code))).length;
      const ready=card==="active";
      const status=ready?"active":(due>0?"needs_information":"pending");
      await admin.from("shops").update({stripe_connect_status:status,stripe_connect_charges_enabled:ready,stripe_connect_requirements:acct.requirements||{},stripe_connect_last_synced_at:new Date().toISOString(),stripe_connect_last_error:null,stripe_connect_card_payments_status:card,stripe_connect_payouts_status:payouts,stripe_connect_requirements_due:due,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
      const tax=await taxStatus();
      return {connected:true,account_id:accountId,status,charges_enabled:ready,card_payments_status:card,payouts_status:payouts,requirements_due:due,dashboard:acct.dashboard,...tax};
    }

    if(action==="status"||action==="tax_status")return json(await sync());
    if(action==="tax_disable"){
      await admin.from("shops").update({stripe_tax_enabled:false,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
      return json({tax_enabled:false,...await taxStatus()});
    }
    if(action==="tax_enable"){
      if(!accountId)return json({error:"Connect the shop to Stripe first."},409);
      const tax=await taxStatus();
      if(!tax.tax_ready)return json({error:"Stripe Tax setup is not ready yet. Complete the shop's Tax settings and registrations in Stripe first.",code:"STRIPE_TAX_NOT_READY",...tax},409);
      await admin.from("shops").update({stripe_tax_enabled:true,stripe_tax_status:"active",updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
      return json({...tax,tax_enabled:true});
    }
    if(action!=="onboard")return json({error:"Unknown action."},400);

    if(!accountId){
      const acct=await stripe("/v2/core/accounts","POST",{
        contact_email:user.email||undefined,
        display_name:shop.name,
        dashboard:"full",
        configuration:{merchant:{capabilities:{card_payments:{requested:true}}}},
        defaults:{currency:"usd",responsibilities:{fees_collector:"stripe",losses_collector:"stripe"},locales:["en-US"]},
        metadata:{shop_id:shop.shop_id,source:"mobile_mechanic_ai"},
        include:["configuration.merchant","requirements","defaults"]
      });
      accountId=acct.id;
      await admin.from("shops").update({stripe_connected_account_id:accountId,stripe_connect_status:"onboarding",stripe_connect_last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
    }

    const link=await stripe("/v2/core/account_links","POST",{
      account:accountId,
      use_case:{type:"account_onboarding",account_onboarding:{collection_options:{fields:"eventually_due"},configurations:["merchant"],return_url:returnUrl,refresh_url:refreshUrl}}
    });
    return json({url:link.url,account_id:accountId,status:"onboarding"});
  }catch(err){
    console.error(err);
    return json({error:err instanceof Error?err.message:"Stripe Connect failed."},500);
  }
});