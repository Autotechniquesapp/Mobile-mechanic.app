import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
const safe=(v:unknown,max=1500)=>String(v??"").slice(0,max);
function smsSegments(text:string){
  const gsm=/^[\x20-\x7E\n\r]*$/;
  const len=[...text].length;
  if(gsm.test(text))return len<=160?1:Math.ceil(len/153);
  return len<=70?1:Math.ceil(len/67);
}
function periodStart(periodEnd:any){
  const end=periodEnd?new Date(periodEnd):null;
  if(end&&Number.isFinite(end.getTime())&&end.getTime()>Date.now()){
    const start=new Date(end);start.setUTCMonth(start.getUTCMonth()-1);return start.toISOString();
  }
  const n=new Date();return new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),1)).toISOString();
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return json({error:"Authentication required."},401);
    const {data:member}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!member||!["shop_owner","owner","manager","service_writer","technician"].includes(String(member.role)))return json({error:"Active shop membership required."},403);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"send");
    const [{data:shop},{data:addon}]=await Promise.all([
      admin.from("shops").select("shop_id,billing_status,stripe_current_period_end").eq("shop_id",member.shop_id).single(),
      admin.from("shop_addons").select("status,quantity").eq("shop_id",member.shop_id).eq("addon_code","sms_reminder_pack").eq("status","active").maybeSingle()
    ]);
    const packQty=Math.max(0,Number(addon?.quantity||0));
    const allowance=packQty*100;
    const start=periodStart(shop?.stripe_current_period_end);
    const {data:usage}=await admin.from("feature_usage_events").select("quantity").eq("shop_id",member.shop_id).eq("feature","sms_sent").gte("created_at",start);
    const used=(usage||[]).reduce((n:any,r:any)=>n+Math.max(0,Number(r.quantity||1)),0);
    const remaining=Math.max(0,allowance-used);
    const sid=Deno.env.get("MMA_TWILIO_ACCOUNT_SID")||"";
    const token=Deno.env.get("MMA_TWILIO_AUTH_TOKEN")||"";
    const from=Deno.env.get("MMA_TWILIO_FROM_NUMBER")||"";
    const msid=Deno.env.get("MMA_TWILIO_MESSAGING_SERVICE_SID")||"";
    const configured=Boolean(sid&&token&&(from||msid));
    if(action==="status")return json({ok:true,configured,allowance,used,remaining,period_start:start});
    if(action!=="send")return json({error:"Unknown action."},400);
    if(!allowance)return json({error:"Automatic SMS requires the 100-message SMS pack. Device SMS is still available without the pack.",code:"SMS_PACK_REQUIRED",allowance,used,remaining},402);
    const to=safe(body.to,32).trim(),text=safe(body.text,1500).trim();
    if(!to||!text)return json({error:"Phone number and message are required."},400);
    const segments=smsSegments(text);
    if(used+segments>allowance)return json({error:"This shop has used its automatic SMS allowance for the current billing period. Add another SMS pack or use device SMS.",code:"SMS_PACK_LIMIT",allowance,used,remaining},402);
    if(!configured)return json({error:"Automatic SMS is ready but the platform Twilio account is not configured yet.",code:"TWILIO_NEEDS_SETUP",allowance,used,remaining},503);
    const f=new URLSearchParams({To:to,Body:text});if(msid)f.set("MessagingServiceSid",msid);else f.set("From",from);
    const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${sid}:${token}`)}`,"Content-Type":"application/x-www-form-urlencoded"},body:f});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d?.message||"SMS send failed.");
    const billedSegments=Math.max(segments,Number(d?.num_segments||0)||segments);
    await admin.from("feature_usage_events").insert({shop_id:member.shop_id,user_id:user.id,feature:"sms_sent",quantity:billedSegments,metadata:{provider:"twilio",message_id:d.sid||null,status:d.status||null,period_start:start}});
    await admin.from("shop_integrations").upsert({shop_id:member.shop_id,provider:"twilio",status:"connected",display_name:"Twilio SMS",public_settings:{shared_platform_service:true,pack_size:100},last_synced_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
    await admin.from("platform_integrations").update({status:"connected",mode:"live",last_checked_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("provider","sms");
    return json({ok:true,message_id:d.sid,status:d.status,segments:billedSegments,allowance,used:used+billedSegments,remaining:Math.max(0,allowance-used-billedSegments)});
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"SMS send failed."},500);}
});