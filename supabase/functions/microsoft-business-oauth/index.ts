import { createClient } from "npm:@supabase/supabase-js@2.112.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
function safeReturn(v:string|null){return v&&v.startsWith("https://mobile-mechanic.app")?v:"https://mobile-mechanic.app/#settings";}
const allowed=new Set(["microsoft_calendar","microsoft_email","onedrive"]);
const scopes:Record<string,string[]>={
 microsoft_calendar:["offline_access","User.Read","Calendars.ReadWrite"],
 microsoft_email:["offline_access","User.Read","Mail.Send"],
 onedrive:["offline_access","User.Read","Files.ReadWrite"]
};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
 const anon=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
 const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
 const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
 const clientId=Deno.env.get("MICROSOFT_CLIENT_ID")||"";
 const clientSecret=Deno.env.get("MICROSOFT_CLIENT_SECRET")||"";
 const tenant=Deno.env.get("MICROSOFT_TENANT_ID")||"common";
 const redirectUri=`${supabaseUrl}/functions/v1/microsoft-business-oauth`;
 const tokenUrl=`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
 const authUrl=`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`;
 const setIntegration=async(shopId:string,provider:string,patch:Record<string,unknown>)=>{await admin.from("shop_integrations").upsert({shop_id:shopId,provider,...patch,updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});};
 try{
  if(req.method==="GET"){
   const u=new URL(req.url),state=u.searchParams.get("state")||"",code=u.searchParams.get("code")||"",denied=u.searchParams.get("error");
   const {data:st}=await admin.from("integration_oauth_states").select("*").eq("state_token",state).maybeSingle();
   if(!st||!allowed.has(st.provider)||st.consumed_at||new Date(st.expires_at).getTime()<Date.now())return Response.redirect("https://mobile-mechanic.app/#settings",302);
   await admin.from("integration_oauth_states").update({consumed_at:new Date().toISOString()}).eq("state_token",state);
   const back=safeReturn(st.return_url);
   if(denied||!code){await setIntegration(st.shop_id,st.provider,{status:"not_connected",last_error:"Microsoft authorization was cancelled or did not complete."});return Response.redirect(back,302);}
   if(!clientId||!clientSecret){await setIntegration(st.shop_id,st.provider,{status:"needs_keys",last_error:"Microsoft OAuth credentials are missing."});return Response.redirect(back,302);}
   const form=new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:"authorization_code",redirect_uri:redirectUri,scope:scopes[st.provider].join(" ")});
   const tr=await fetch(tokenUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
   const t=await tr.json();if(!tr.ok||!t.access_token)throw new Error(t?.error_description||"Microsoft token exchange failed.");
   let profile:any={};try{const pr=await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",{headers:{Authorization:`Bearer ${t.access_token}`}});profile=await pr.json();}catch{}
   const email=profile.mail||profile.userPrincipalName||null;
   await admin.from("shop_integration_credentials").upsert({shop_id:st.shop_id,provider:st.provider,access_token:t.access_token,refresh_token:t.refresh_token||null,token_expires_at:new Date(Date.now()+Number(t.expires_in||3600)*1000).toISOString(),token_type:t.token_type||"Bearer",credential_metadata:{microsoft_user_id:profile.id||null,email,tenant},updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
   await setIntegration(st.shop_id,st.provider,{status:"connected",external_account_id:profile.id||email,display_name:email||profile.displayName||"Microsoft 365",public_settings:{email},last_error:null,last_synced_at:new Date().toISOString()});
   return Response.redirect(back,302);
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(supabaseUrl,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:"Authentication required."},401);
  const {data:m}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!m||!["shop_owner","manager"].includes(m.role))return json({error:"Only a shop owner or manager can connect Microsoft services."},403);
  const body=await req.json().catch(()=>({}));const provider=String(body.provider||"");if(!allowed.has(provider))return json({error:"Unsupported Microsoft integration."},400);
  if(!clientId||!clientSecret){await setIntegration(m.shop_id,provider,{status:"needs_keys",last_error:"Microsoft OAuth credentials are missing."});return json({error:"Microsoft integrations are ready in the app, but MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET still need to be added to Supabase secrets.",code:"microsoft_needs_keys",redirect_uri:redirectUri},503);}
  const state=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
  const returnUrl=safeReturn(String(body.return_url||"https://mobile-mechanic.app/#settings"));
  await admin.from("integration_oauth_states").insert({state_token:state,shop_id:m.shop_id,provider,user_id:user.id,return_url:returnUrl});
  await setIntegration(m.shop_id,provider,{status:"connecting",last_error:null});
  const qs=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirectUri,response_mode:"query",scope:scopes[provider].join(" "),state});
  return json({url:`${authUrl}?${qs.toString()}`,redirect_uri:redirectUri});
 }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Microsoft connection failed."},500);}
});
