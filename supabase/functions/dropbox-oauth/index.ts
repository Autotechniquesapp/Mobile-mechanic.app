import { createClient } from "npm:@supabase/supabase-js@2.112.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const parsed=JSON.parse(Deno.env.get(jsonName)||"{}");if(parsed?.default)return parsed.default;}catch{}return Deno.env.get(legacyName)||"";}
function safeReturn(v:string|null){return v&&/^https:\/\/(www\.)?mobile-mechanic\.app\//i.test(v)?v:"https://mobile-mechanic.app/#settings";}
function addSeconds(seconds:number){return new Date(Date.now()+Math.max(0,seconds)*1000).toISOString();}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const supabaseUrl=Deno.env.get("SUPABASE_URL")!;const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
 const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
 const clientId=Deno.env.get("DROPBOX_CLIENT_ID")||Deno.env.get("DROPBOX_APP_KEY")||"";const clientSecret=Deno.env.get("DROPBOX_CLIENT_SECRET")||Deno.env.get("DROPBOX_APP_SECRET")||"";
 const redirectUri=`${supabaseUrl}/functions/v1/dropbox-oauth`;
 const setIntegration=async(shopId:string,patch:Record<string,unknown>)=>{await admin.from("shop_integrations").upsert({shop_id:shopId,provider:"dropbox",...patch,updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});};
 async function authShop(){const auth=req.headers.get("Authorization")||"";const uc=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});const {data:{user}}=await uc.auth.getUser();if(!user)return {error:json({error:"Authentication required."},401)};const {data:member}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!member||!["shop_owner","manager"].includes(member.role))return {error:json({error:"Only a shop owner or manager can manage Dropbox."},403)};return {user,member};}
 try{
  if(req.method==="GET"){
   const u=new URL(req.url),state=u.searchParams.get("state")||"",code=u.searchParams.get("code")||"",denied=u.searchParams.get("error_description")||u.searchParams.get("error");
   const {data:st}=await admin.from("integration_oauth_states").select("*").eq("state_token",state).eq("provider","dropbox").maybeSingle();
   if(!st||st.consumed_at||new Date(st.expires_at).getTime()<Date.now())return Response.redirect("https://mobile-mechanic.app/#settings",302);
   await admin.from("integration_oauth_states").update({consumed_at:new Date().toISOString()}).eq("state_token",state);const back=safeReturn(st.return_url);
   if(denied||!code){await setIntegration(st.shop_id,{status:"not_connected",last_error:"Dropbox authorization was cancelled or did not complete."});return Response.redirect(back,302);}
   if(!clientId||!clientSecret){await setIntegration(st.shop_id,{status:"needs_keys",last_error:"Dropbox developer credentials are missing."});return Response.redirect(back,302);}
   const form=new URLSearchParams({code,grant_type:"authorization_code",client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri});
   const tr=await fetch("https://api.dropboxapi.com/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:form});const token=await tr.json();
   if(!tr.ok||!token.access_token)throw new Error(token?.error_description||token?.error||"Dropbox token exchange failed.");
   let display="Dropbox",accountId=token.account_id||null;
   try{const ar=await fetch("https://api.dropboxapi.com/2/users/get_current_account",{method:"POST",headers:{Authorization:`Bearer ${token.access_token}`,"Content-Type":"application/json"}});const a=await ar.json();if(ar.ok){display=a?.name?.display_name||a?.email||display;accountId=a?.account_id||accountId;}}catch{}
   await admin.from("shop_integration_credentials").upsert({shop_id:st.shop_id,provider:"dropbox",access_token:token.access_token,refresh_token:token.refresh_token||null,token_expires_at:token.expires_in?addSeconds(Number(token.expires_in)):null,refresh_token_expires_at:null,token_type:token.token_type||"bearer",credential_metadata:{account_id:accountId,scope:token.scope||null},updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
   await setIntegration(st.shop_id,{status:"connected",external_account_id:accountId,display_name:display,public_settings:{account_id:accountId},last_error:null,last_synced_at:new Date().toISOString()});return Response.redirect(back,302);
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);const a=await authShop();if("error" in a)return a.error;const body=await req.json().catch(()=>({}));
  if(!clientId||!clientSecret){await setIntegration(a.member.shop_id,{status:"needs_keys",last_error:"Dropbox developer credentials are missing."});return json({error:"Dropbox app credentials still need to be added to Supabase secrets.",code:"dropbox_needs_keys",redirect_uri:redirectUri},503);}
  const state=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");const returnUrl=safeReturn(String(body.return_url||"https://mobile-mechanic.app/#settings"));
  await admin.from("integration_oauth_states").insert({state_token:state,shop_id:a.member.shop_id,provider:"dropbox",user_id:a.user.id,return_url:returnUrl});await setIntegration(a.member.shop_id,{status:"connecting",last_error:null});
  const qs=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirectUri,state,token_access_type:"offline",scope:"account_info.read files.metadata.read files.content.write"});
  return json({url:`https://www.dropbox.com/oauth2/authorize?${qs.toString()}`,redirect_uri:redirectUri});
 }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Dropbox connection failed."},500);}
});