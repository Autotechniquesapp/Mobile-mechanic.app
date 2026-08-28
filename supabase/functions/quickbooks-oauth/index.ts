import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { safeReturn, claimState, checked } from "../_shared/oauth-safety.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const parsed=JSON.parse(Deno.env.get(jsonName)||"{}");if(parsed?.default)return parsed.default;}catch{}return Deno.env.get(legacyName)||"";}
function addSeconds(seconds:number){return new Date(Date.now()+Math.max(0,seconds)*1000).toISOString();}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});

  const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
  const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
  const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
  const clientId=Deno.env.get("QUICKBOOKS_CLIENT_ID")||Deno.env.get("INTUIT_CLIENT_ID")||"";
  const clientSecret=Deno.env.get("QUICKBOOKS_CLIENT_SECRET")||Deno.env.get("INTUIT_CLIENT_SECRET")||"";
  const configured=(Deno.env.get("QUICKBOOKS_ENVIRONMENT")||"sandbox").toLowerCase();
  const environment=configured==="production"?"production":"sandbox";
  const apiBase=environment==="production"?"https://quickbooks.api.intuit.com":"https://sandbox-quickbooks.api.intuit.com";
  const authUrl="https://appcenter.intuit.com/connect/oauth2";
  const tokenUrl="https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const redirectUri=`${supabaseUrl}/functions/v1/quickbooks-oauth`;

  async function setIntegration(shopId:string,patch:Record<string,unknown>){
    await checked(admin.from("shop_integrations").upsert({shop_id:shopId,provider:"quickbooks",...patch,updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"}));
  }

  async function authShop(){
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return {error:json({error:"Authentication required."},401)};
    const {data:member}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!member||!["shop_owner","manager"].includes(member.role))return {error:json({error:"Only a shop owner or manager can manage QuickBooks."},403)};
    return {user,member};
  }

  async function refreshIfNeeded(shopId:string){
    const {data:cred}=await admin.from("shop_integration_credentials").select("*").eq("shop_id",shopId).eq("provider","quickbooks").maybeSingle();
    if(!cred?.refresh_token)return cred;
    const expires=cred.token_expires_at?new Date(cred.token_expires_at).getTime():0;
    if(expires>Date.now()+120000)return cred;
    if(!clientId||!clientSecret)return cred;
    const body=new URLSearchParams({grant_type:"refresh_token",refresh_token:cred.refresh_token});
    const basic=btoa(`${clientId}:${clientSecret}`);
    const r=await fetch(tokenUrl,{method:"POST",headers:{Authorization:`Basic ${basic}`,"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body});
    const t=await r.json();
    if(!r.ok||!t.access_token){await setIntegration(shopId,{status:"needs_attention",last_error:"QuickBooks token refresh failed. Reconnect your account."});throw new Error("QuickBooks needs to be reconnected.");}
    const updated={
      shop_id:shopId,provider:"quickbooks",access_token:t.access_token,refresh_token:t.refresh_token||cred.refresh_token,
      token_expires_at:addSeconds(Number(t.expires_in||3600)),refresh_token_expires_at:t.x_refresh_token_expires_in?addSeconds(Number(t.x_refresh_token_expires_in)):cred.refresh_token_expires_at,
      token_type:t.token_type||"bearer",credential_metadata:cred.credential_metadata||{},updated_at:new Date().toISOString()
    };
    await checked(admin.from("shop_integration_credentials").upsert(updated,{onConflict:"shop_id,provider"}));
    return updated;
  }

  try{
    if(req.method==="GET"){
      const u=new URL(req.url);
      const state=u.searchParams.get("state")||"";
      const code=u.searchParams.get("code")||"";
      const realmId=u.searchParams.get("realmId")||"";
      const denied=u.searchParams.get("error")||u.searchParams.get("error_description");
      const st=await claimState(admin,"integration_oauth_states","quickbooks",state);
      if(!st)return Response.redirect("https://mobile-mechanic.app/#settings",302);
      const back=safeReturn(st.return_url);
      if(denied||!code||!realmId){await setIntegration(st.shop_id,{status:"not_connected",last_error:"QuickBooks authorization was cancelled or did not complete."});return Response.redirect(back,302);}
      if(!clientId||!clientSecret){await setIntegration(st.shop_id,{status:"needs_keys",last_error:"QuickBooks developer credentials are missing."});return Response.redirect(back,302);}

      const form=new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:redirectUri});
      const basic=btoa(`${clientId}:${clientSecret}`);
      const tokenRes=await fetch(tokenUrl,{method:"POST",headers:{Authorization:`Basic ${basic}`,"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:form});
      const token=await tokenRes.json();
      if(!tokenRes.ok||!token.access_token)throw new Error(token?.error_description||token?.error||"QuickBooks token exchange failed.");

      let companyName="QuickBooks Online";
      {
        const companyRes=await fetch(`${apiBase}/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}`,{headers:{Authorization:`Bearer ${token.access_token}`,Accept:"application/json"}});
        const company=await companyRes.json();
        if(!companyRes.ok||!company?.CompanyInfo){
          await setIntegration(st.shop_id,{status:"needs_attention",last_error:"Could not verify the QuickBooks company. Reconnect and authorize this company."});
          return Response.redirect(back,302);
        }
        companyName=company.CompanyInfo.CompanyName||company.CompanyInfo.LegalName||companyName;
      }

      await checked(admin.from("shop_integration_credentials").upsert({
        shop_id:st.shop_id,provider:"quickbooks",access_token:token.access_token,refresh_token:token.refresh_token||null,
        token_expires_at:addSeconds(Number(token.expires_in||3600)),refresh_token_expires_at:token.x_refresh_token_expires_in?addSeconds(Number(token.x_refresh_token_expires_in)):null,
        token_type:token.token_type||"bearer",credential_metadata:{environment,realm_id:realmId},updated_at:new Date().toISOString()
      },{onConflict:"shop_id,provider"}));
      await setIntegration(st.shop_id,{status:"connected",external_account_id:realmId,display_name:companyName,public_settings:{environment,realm_id:realmId,sync_available:false},last_error:null,last_synced_at:null});
      return Response.redirect(back,302);
    }

    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    const authResult=await authShop();
    if("error" in authResult)return authResult.error;
    const {member}=authResult;
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"status");

    if(action==="status"){
      const {data:row}=await admin.from("shop_integrations").select("provider,status,external_account_id,display_name,public_settings,last_error,last_synced_at").eq("shop_id",member.shop_id).eq("provider","quickbooks").maybeSingle();
      return json({integration:row||{provider:"quickbooks",status:"not_connected"},redirect_uri:redirectUri,environment,configured:!!(clientId&&clientSecret)});
    }

    if(action==="disconnect"){
      await checked(admin.from("shop_integration_credentials").delete().eq("shop_id",member.shop_id).eq("provider","quickbooks"));
      await setIntegration(member.shop_id,{status:"not_connected",external_account_id:null,display_name:null,public_settings:{environment},last_error:null,last_synced_at:null});
      return json({ok:true});
    }

    if(action==="company"){
      const cred=await refreshIfNeeded(member.shop_id);
      const realmId=cred?.credential_metadata?.realm_id;
      if(!cred?.access_token||!realmId)return json({error:"QuickBooks is not connected."},409);
      const r=await fetch(`${apiBase}/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}`,{headers:{Authorization:`Bearer ${cred.access_token}`,Accept:"application/json"}});
      const d=await r.json();
      if(!r.ok)return json({error:d?.Fault?.Error?.[0]?.Message||"Could not read QuickBooks company information."},r.status);
      return json({company:d?.CompanyInfo||null});
    }

    if(action!=="connect")return json({error:"Unknown action."},400);
    if(!clientId||!clientSecret){await setIntegration(member.shop_id,{status:"needs_keys",last_error:"QuickBooks developer credentials are missing."});return json({error:"QuickBooks is ready in the app, but the Intuit Client ID and Client Secret still need to be added to Supabase secrets.",code:"quickbooks_needs_keys",redirect_uri:redirectUri},503);}

    const state=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
    const returnUrl=safeReturn(String(body.return_url||"https://mobile-mechanic.app/#settings"));
    await checked(admin.from("integration_oauth_states").insert({state_token:state,shop_id:member.shop_id,provider:"quickbooks",user_id:authResult.user.id,return_url:returnUrl}));
    await setIntegration(member.shop_id,{status:"connecting",last_error:null,public_settings:{environment}});
    const qs=new URLSearchParams({client_id:clientId,response_type:"code",scope:"com.intuit.quickbooks.accounting",redirect_uri:redirectUri,state});
    return json({url:`${authUrl}?${qs.toString()}`,redirect_uri:redirectUri,environment});
  }catch(err){
    console.error(err);
    return json({error:err instanceof Error?err.message:"QuickBooks connection failed."},500);
  }
});
