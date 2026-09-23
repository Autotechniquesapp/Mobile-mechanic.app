import { createClient } from "npm:@supabase/supabase-js@2.112.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
function safeReturn(v:string|null){return v&&v.startsWith("https://mobile-mechanic.app")?v:"https://mobile-mechanic.app/#settings";}
const allowed=new Set(["google_calendar","gmail","google_drive"]);
const scopes:Record<string,string[]>={
 google_calendar:["openid","email","profile","https://www.googleapis.com/auth/calendar.events"],
 gmail:["openid","email","profile","https://www.googleapis.com/auth/gmail.send"],
 google_drive:["openid","email","profile","https://www.googleapis.com/auth/drive.file"]
};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
 const anon=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
 const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
 const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
 const clientId=Deno.env.get("GOOGLE_CLIENT_ID")||"";
 const clientSecret=Deno.env.get("GOOGLE_CLIENT_SECRET")||"";
 const redirectUri=`${supabaseUrl}/functions/v1/google-business-oauth`;
 const setIntegration=async(shopId:string,provider:string,patch:Record<string,unknown>)=>{await admin.from("shop_integrations").upsert({shop_id:shopId,provider,...patch,updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});};
 try{
  if(req.method==="GET"){
   const u=new URL(req.url),state=u.searchParams.get("state")||"",code=u.searchParams.get("code")||"",denied=u.searchParams.get("error");
   const {data:st}=await admin.from("integration_oauth_states").select("*").eq("state_token",state).maybeSingle();
   if(!st||!allowed.has(st.provider)||st.consumed_at||new Date(st.expires_at).getTime()<Date.now())return Response.redirect("https://mobile-mechanic.app/#settings",302);
   await admin.from("integration_oauth_states").update({consumed_at:new Date().toISOString()}).eq("state_token",state);
   const back=safeReturn(st.return_url);
   if(denied||!code){await setIntegration(st.shop_id,st.provider,{status:"not_connected",last_error:"Google authorization was cancelled or did not complete."});return Response.redirect(back,302);}
   if(!clientId||!clientSecret){await setIntegration(st.shop_id,st.provider,{status:"needs_keys",last_error:"Google OAuth credentials are missing."});return Response.redirect(back,302);}
   const form=new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:"authorization_code",redirect_uri:redirectUri});
   const tr=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
   const t=await tr.json(); if(!tr.ok||!t.access_token)throw new Error(t?.error_description||"Google token exchange failed.");
   let profile:any={};try{const pr=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${t.access_token}`}});profile=await pr.json();}catch{}
   await admin.from("shop_integration_credentials").upsert({shop_id:st.shop_id,provider:st.provider,access_token:t.access_token,refresh_token:t.refresh_token||null,token_expires_at:new Date(Date.now()+Number(t.expires_in||3600)*1000).toISOString(),token_type:t.token_type||"Bearer",credential_metadata:{email:profile.email||null,google_sub:profile.sub||null},updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
   await setIntegration(st.shop_id,st.provider,{status:"connected",external_account_id:profile.sub||profile.email||null,display_name:profile.email||profile.name||"Google",public_settings:{email:profile.email||null},last_error:null,last_synced_at:new Date().toISOString()});
   return Response.redirect(back,302);
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(supabaseUrl,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:"Authentication required."},401);
  const body=await req.json().catch(()=>({}));const shopId=String(body.shop_id||"").trim();if(!shopId)return json({error:"Select a shop before connecting Google services."},400);
  const {data:m}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("shop_id",shopId).eq("status","active").maybeSingle();
  if(!m||!["shop_owner","manager"].includes(m.role))return json({error:"Only a shop owner or manager in the selected shop can connect Google services."},403);
  const provider=String(body.provider||"");if(!allowed.has(provider))return json({error:"Unsupported Google integration."},400);
  if(!clientId||!clientSecret){await setIntegration(m.shop_id,provider,{status:"needs_keys",last_error:"Google OAuth credentials are missing."});return json({error:"Google integrations are ready in the app, but GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET still need to be added to Supabase secrets.",code:"google_needs_keys",redirect_uri:redirectUri},503);}
  const state=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
  const returnUrl=safeReturn(String(body.return_url||"https://mobile-mechanic.app/#settings"));
  await admin.from("integration_oauth_states").insert({state_token:state,shop_id:m.shop_id,provider,user_id:user.id,return_url:returnUrl});
  await setIntegration(m.shop_id,provider,{status:"connecting",last_error:null});
  const qs=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:scopes[provider].join(" "),access_type:"offline",prompt:"consent",include_granted_scopes:"true",state});
  return json({url:`https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`,redirect_uri:redirectUri});
 }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Google connection failed."},500);}
});