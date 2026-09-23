import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
function safeReturn(v:string|null){return v&&v.startsWith("https://mobile-mechanic.app")?v:"https://mobile-mechanic.app/#settings";}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
  const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
  const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
  const appId=Deno.env.get("SQUARE_APPLICATION_ID")||"";
  const appSecret=Deno.env.get("SQUARE_APPLICATION_SECRET")||"";
  const configuredEnv=(Deno.env.get("SQUARE_ENVIRONMENT")||"").toLowerCase();
  const inferredEnv=appId.startsWith("sandbox-")?"sandbox":"production";
  const env=configuredEnv==="sandbox"||configuredEnv==="production"?configuredEnv:inferredEnv;
  const oauthBase=env==="production"?"https://connect.squareup.com/oauth2":"https://connect.squareupsandbox.com/oauth2";
  const apiBase=env==="production"?"https://connect.squareup.com":"https://connect.squareupsandbox.com";

  let callbackState:any=null;
  try{
    if(req.method==="GET"){
      const u=new URL(req.url),state=u.searchParams.get("state")||"",code=u.searchParams.get("code")||"",denied=u.searchParams.get("error");
      const {data:st}=await admin.from("payment_oauth_states").select("*").eq("state_token",state).eq("provider","square").maybeSingle();
      callbackState=st;
      if(!st||st.consumed_at||new Date(st.expires_at).getTime()<Date.now())return Response.redirect("https://mobile-mechanic.app/#settings",302);
      await admin.from("payment_oauth_states").update({consumed_at:new Date().toISOString()}).eq("state_token",state);
      const back=safeReturn(st.return_url);
      if(denied||!code){await admin.from("shop_payment_processors").update({status:"not_connected",last_error:"Square authorization was cancelled or did not complete.",updated_at:new Date().toISOString()}).eq("shop_id",st.shop_id).eq("provider","square");return Response.redirect(back,302);}
      if(!appId||!appSecret){await admin.from("shop_payment_processors").update({status:"needs_keys",last_error:"Square application credentials are missing.",updated_at:new Date().toISOString()}).eq("shop_id",st.shop_id).eq("provider","square");return Response.redirect(back,302);}

      const tokenRes=await fetch(`${oauthBase}/token`,{method:"POST",headers:{"Square-Version":"2026-08-19","Content-Type":"application/json"},body:JSON.stringify({client_id:appId,client_secret:appSecret,code,grant_type:"authorization_code"})});
      const token=await tokenRes.json();
      if(!tokenRes.ok||!token.access_token)throw new Error(token?.errors?.[0]?.detail||"Square token exchange failed.");

      const locRes=await fetch(`${apiBase}/v2/locations`,{headers:{Authorization:`Bearer ${token.access_token}`,"Square-Version":"2026-08-19","Content-Type":"application/json"}});
      const locData=await locRes.json();
      if(!locRes.ok)throw new Error(locData?.errors?.[0]?.detail||"Could not retrieve Square locations.");
      const locations=Array.isArray(locData.locations)?locData.locations:[];
      const location=locations.find((x:any)=>x.status==="ACTIVE"&&x.capabilities?.includes?.("CREDIT_CARD_PROCESSING"))||locations.find((x:any)=>x.status==="ACTIVE")||locations[0]||null;

      await admin.from("payment_processor_credentials").upsert({shop_id:st.shop_id,provider:"square",access_token:token.access_token,refresh_token:token.refresh_token||null,token_expires_at:token.expires_at||null,merchant_id:token.merchant_id||location?.merchant_id||null,location_id:location?.id||null,credential_metadata:{environment:env,location_name:location?.name||null},updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
      await admin.from("shop_payment_processors").update({status:"connected",external_account_id:token.merchant_id||location?.merchant_id||null,display_name:location?.business_name||location?.name||"Square",public_settings:{mode:env,location_id:location?.id||null,location_name:location?.name||null},capabilities:{cards:true,payment_links:true,invoices:true,cash_app_pay:true},last_error:null,last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("shop_id",st.shop_id).eq("provider","square");
      return Response.redirect(back,302);
    }

    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return json({error:"Authentication required."},401);
    const {data:m}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!m||!["shop_owner","owner","manager"].includes(m.role))return json({error:"Only a shop owner or manager can connect Square."},403);
    if(!appId||!appSecret)return json({error:"Square is ready in the app, but the Square developer Application ID and Application Secret still need to be added to Supabase secrets.",code:"square_needs_keys"},503);

    const body=await req.json().catch(()=>({}));
    const state=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
    const returnUrl=safeReturn(String(body.return_url||"https://mobile-mechanic.app/#settings"));
    await admin.from("payment_oauth_states").insert({state_token:state,shop_id:m.shop_id,provider:"square",user_id:user.id,return_url:returnUrl});
    await admin.from("shop_payment_processors").update({status:"connecting",last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",m.shop_id).eq("provider","square");

    const scopes=["MERCHANT_PROFILE_READ","PAYMENTS_READ","PAYMENTS_WRITE","ORDERS_READ","ORDERS_WRITE","INVOICES_READ","INVOICES_WRITE","CUSTOMERS_READ","CUSTOMERS_WRITE"];
    const qs=new URLSearchParams({client_id:appId,scope:scopes.join(" "),state,session:"false"});
    return json({url:`${oauthBase}/authorize?${qs.toString()}`,environment:env});
  }catch(err){
    console.error(err);
    if(callbackState?.shop_id){
      const message=err instanceof Error?err.message:"Square connection failed.";
      await admin.from("shop_payment_processors").update({status:"needs_attention",last_error:message,updated_at:new Date().toISOString()}).eq("shop_id",callbackState.shop_id).eq("provider","square");
      return Response.redirect(safeReturn(callbackState.return_url),302);
    }
    return json({error:err instanceof Error?err.message:"Square connection failed."},500);
  }
});