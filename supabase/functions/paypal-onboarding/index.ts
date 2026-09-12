import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { safeReturn, claimState, checked } from "../_shared/oauth-safety.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
  const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
  const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
  const clientId=Deno.env.get("PAYPAL_CLIENT_ID")||"";
  const clientSecret=Deno.env.get("PAYPAL_CLIENT_SECRET")||"";
  const partnerId=Deno.env.get("PAYPAL_PARTNER_ID")||"";
  const bnCode=Deno.env.get("PAYPAL_BN_CODE")||"";
  const env=(Deno.env.get("PAYPAL_ENVIRONMENT")||"sandbox").toLowerCase();
  const api=env==="production"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";
  const callback=`${supabaseUrl}/functions/v1/paypal-onboarding`;

  async function platformToken(){
    if(!clientId||!clientSecret)throw new Error("PayPal platform credentials are missing.");
    const basic=btoa(`${clientId}:${clientSecret}`);
    const r=await fetch(`${api}/v1/oauth2/token`,{method:"POST",headers:{Authorization:`Basic ${basic}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
    const d=await r.json();if(!r.ok||!d.access_token)throw new Error(d?.error_description||d?.error||"Could not authenticate with PayPal.");return d.access_token as string;
  }

  try{
    if(req.method==="GET"){
      const u=new URL(req.url);
      const state=u.searchParams.get("merchantId")||u.searchParams.get("state")||"";
      const merchantId=u.searchParams.get("merchantIdInPayPal")||"";
      const st=await claimState(admin,"payment_oauth_states","paypal",state);
      if(!st)return Response.redirect("https://mobile-mechanic.app/#settings",302);
      const back=safeReturn(st.return_url);
      const attention=async(message:string)=>checked(admin.from("shop_payment_processors").update({status:"needs_attention",last_error:message,capabilities:{paypal:false,venmo:false,invoices:false},updated_at:new Date().toISOString()}).eq("shop_id",st.shop_id).eq("provider","paypal"));
      if(!merchantId||!partnerId){await attention("PayPal onboarding did not complete. Reconnect PayPal.");return Response.redirect(back,302);}
      const access=await platformToken();
      const headers:any={Authorization:`Bearer ${access}`,Accept:"application/json"};
      if(bnCode)headers["PayPal-Partner-Attribution-Id"]=bnCode;
      // Verify both the seller identity and referral against PayPal, never callback flags.
      const result=await fetch(`${api}/v1/customer/partners/${encodeURIComponent(partnerId)}/merchant-integrations/${encodeURIComponent(merchantId)}`,{headers});
      const seller=await result.json();
      const permitted=Array.isArray(seller.oauth_integrations)&&seller.oauth_integrations.some((integration:any)=>
        integration.integration_type==="OAUTH_THIRD_PARTY"&&(!integration.status||integration.status==="A")&&Array.isArray(integration.oauth_third_party)&&
        integration.oauth_third_party.some((party:any)=>party.partner_client_id===clientId&&Array.isArray(party.scopes)&&party.scopes.includes("https://uri.paypal.com/services/payments/payment/authcapture")));
      if(!result.ok||seller.merchant_id!==merchantId||seller.tracking_id!==state||!permitted){
        await attention("PayPal could not verify this seller and payment permissions. Reconnect PayPal.");
        return Response.redirect(back,302);
      }
      const ready=seller.payments_receivable===true&&seller.primary_email_confirmed===true;
      await checked(admin.from("payment_processor_credentials").upsert({shop_id:st.shop_id,provider:"paypal",merchant_id:merchantId,credential_metadata:{environment:env,permissions_granted:true,email_confirmed:seller.primary_email_confirmed===true,payments_receivable:seller.payments_receivable===true},updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"}));
      await checked(admin.from("shop_payment_processors").update({status:ready?"connected":"needs_attention",external_account_id:merchantId,display_name:"PayPal",public_settings:{mode:env,email_confirmed:seller.primary_email_confirmed===true},capabilities:{paypal:ready,venmo:false,invoices:false},last_error:ready?null:"Complete PayPal account verification before accepting payments.",last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("shop_id",st.shop_id).eq("provider","paypal"));
      return Response.redirect(back,302);
    }

    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return json({error:"Authentication required."},401);
    const {data:m}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!m||!["shop_owner","owner","manager"].includes(m.role))return json({error:"Only a shop owner or manager can connect PayPal."},403);
    if(!clientId||!clientSecret||!partnerId)return json({error:"PayPal / Venmo is ready in the app, but the PayPal platform Client ID, Client Secret, and Partner Merchant ID still need to be added to Supabase secrets.",code:"paypal_needs_keys"},503);
    const body=await req.json().catch(()=>({}));
    const state=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
    const returnUrl=safeReturn(String(body.return_url||"https://mobile-mechanic.app/#settings"));
    await checked(admin.from("payment_oauth_states").insert({state_token:state,shop_id:m.shop_id,provider:"paypal",user_id:user.id,return_url:returnUrl}));
    const access=await platformToken();
    const headers:any={Authorization:`Bearer ${access}`,"Content-Type":"application/json"};if(bnCode)headers["PayPal-Partner-Attribution-Id"]=bnCode;
    const referral={
      tracking_id:state,
      operations:[{operation:"API_INTEGRATION",api_integration_preference:{rest_api_integration:{integration_method:"PAYPAL",integration_type:"THIRD_PARTY",third_party_details:{features:["PAYMENT","REFUND","INVOICE_READ_WRITE","ACCESS_MERCHANT_INFORMATION"]}}}}],
      products:["EXPRESS_CHECKOUT"],
      partner_config_override:{return_url:callback,return_url_description:"Return to Mobile Mechanic AI payment settings"},
      legal_consents:[{type:"SHARE_DATA_CONSENT",granted:true}]
    };
    const r=await fetch(`${api}/v2/customer/partner-referrals`,{method:"POST",headers,body:JSON.stringify(referral)});
    const d=await r.json();if(!r.ok)throw new Error(d?.message||d?.details?.[0]?.description||"PayPal seller onboarding could not be started.");
    const action=d?.links?.find?.((x:any)=>x.rel==="action_url")?.href;
    if(!action)throw new Error("PayPal did not return an onboarding link.");
    await checked(admin.from("shop_payment_processors").update({status:"connecting",last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",m.shop_id).eq("provider","paypal"));
    return json({url:action,environment:env,partner_approval_required_for_live:true});
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"PayPal onboarding failed."},500);}
});
