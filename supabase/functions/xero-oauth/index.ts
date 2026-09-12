import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { safeReturn, claimState, checked } from "../_shared/oauth-safety.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
 const anon=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
 const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
 const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
 const clientId=Deno.env.get("XERO_CLIENT_ID")||"";
 const clientSecret=Deno.env.get("XERO_CLIENT_SECRET")||"";
 const redirectUri=`${supabaseUrl}/functions/v1/xero-oauth`;
 const setIntegration=async(shopId:string,patch:Record<string,unknown>)=>{await checked(admin.from("shop_integrations").upsert({shop_id:shopId,provider:"xero",...patch,updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"}));};
 try{
  if(req.method==="GET"){
   const u=new URL(req.url),state=u.searchParams.get("state")||"",code=u.searchParams.get("code")||"",denied=u.searchParams.get("error");
   const st=await claimState(admin,"integration_oauth_states","xero",state);
   if(!st)return Response.redirect("https://mobile-mechanic.app/#settings",302);
   const back=safeReturn(st.return_url);
   if(denied||!code){await setIntegration(st.shop_id,{status:"not_connected",last_error:"Xero authorization was cancelled or did not complete."});return Response.redirect(back,302);}
   if(!clientId||!clientSecret){await setIntegration(st.shop_id,{status:"needs_keys",last_error:"Xero OAuth credentials are missing."});return Response.redirect(back,302);}
   const basic=btoa(`${clientId}:${clientSecret}`);
   const form=new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:redirectUri});
   const tr=await fetch("https://identity.xero.com/connect/token",{method:"POST",headers:{Authorization:`Basic ${basic}`,"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:form});
   const t=await tr.json();if(!tr.ok||!t.access_token)throw new Error(t?.error_description||"Xero token exchange failed.");
   const cr=await fetch("https://api.xero.com/connections",{headers:{Authorization:`Bearer ${t.access_token}`,Accept:"application/json"}});
   const connections=await cr.json();
   if(!cr.ok||!Array.isArray(connections)||connections.length!==1||!connections[0]?.tenantId){
    await setIntegration(st.shop_id,{status:"needs_attention",last_error:"Xero must authorize exactly one organization for this shop. Review your Xero app connections and reconnect."});
    return Response.redirect(back,302);
   }
   const tenant=connections[0],tenantId=tenant.tenantId,tenantName=tenant.tenantName||"Xero";
   await checked(admin.from("shop_integration_credentials").upsert({shop_id:st.shop_id,provider:"xero",access_token:t.access_token,refresh_token:t.refresh_token||null,token_expires_at:new Date(Date.now()+Number(t.expires_in||1800)*1000).toISOString(),token_type:t.token_type||"Bearer",credential_metadata:{tenant_id:tenantId,tenant_name:tenantName},updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"}));
   await setIntegration(st.shop_id,{status:"connected",external_account_id:tenantId,display_name:tenantName,public_settings:{tenant_id:tenantId,tenant_name:tenantName,sync_available:false},last_error:null,last_synced_at:null});
   return Response.redirect(back,302);
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(supabaseUrl,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:"Authentication required."},401);
  const {data:m}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!m||!["shop_owner","manager"].includes(m.role))return json({error:"Only a shop owner or manager can connect Xero."},403);
  if(!clientId||!clientSecret){await setIntegration(m.shop_id,{status:"needs_keys",last_error:"Xero OAuth credentials are missing."});return json({error:"Xero is ready in the app, but XERO_CLIENT_ID and XERO_CLIENT_SECRET still need to be added to Supabase secrets.",code:"xero_needs_keys",redirect_uri:redirectUri},503);}
  const body=await req.json().catch(()=>({}));
  const state=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
  const returnUrl=safeReturn(String(body.return_url||"https://mobile-mechanic.app/#settings"));
  await checked(admin.from("integration_oauth_states").insert({state_token:state,shop_id:m.shop_id,provider:"xero",user_id:user.id,return_url:returnUrl}));
  await setIntegration(m.shop_id,{status:"connecting",last_error:null});
  const qs=new URLSearchParams({response_type:"code",client_id:clientId,redirect_uri:redirectUri,scope:"openid profile email offline_access accounting.transactions accounting.contacts",state});
  return json({url:`https://login.xero.com/identity/connect/authorize?${qs.toString()}`,redirect_uri:redirectUri});
 }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Xero connection failed."},500);}
});
