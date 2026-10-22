import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";
import {nativePushConfigured,sendNativeIntakePush} from "./native-fcm.ts";

const allowedOrigins=new Set(["https://mobile-mechanic.app","https://www.mobile-mechanic.app"]);
function corsFor(req:Request){
  const origin=req.headers.get("Origin")||"https://mobile-mechanic.app";
  return {
    "Access-Control-Allow-Origin":allowedOrigins.has(origin)?origin:"https://mobile-mechanic.app",
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin"
  };
}
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}

Deno.serve(async(req)=>{
  const cors=corsFor(req);
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")!;
  const anon=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
  const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const body=await req.json().catch(()=>({}));
  const action=String(body.action||"");

  async function vapid(){
    let {data:cfg}=await admin.from("push_vapid_config").select("public_key,private_key").eq("singleton",true).maybeSingle();
    if(!cfg){
      const keys=webpush.generateVAPIDKeys();
      const {data:created,error}=await admin.from("push_vapid_config").upsert({singleton:true,public_key:keys.publicKey,private_key:keys.privateKey,updated_at:new Date().toISOString()},{onConflict:"singleton"}).select("public_key,private_key").single();
      if(error)throw error;cfg=created;
    }
    return cfg!;
  }

  try{
    if(action==="public_key"){
      const cfg=await vapid();
      return json({ok:true,public_key:cfg.public_key});
    }

    if(action==="subscribe"||action==="unsubscribe"){
      const auth=req.headers.get("Authorization")||"";
      if(!auth)return json({error:"Authentication required."},401);
      const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
      const {data:{user}}=await userClient.auth.getUser();
      if(!user)return json({error:"Authentication required."},401);
      const {data:member}=await admin.from("shop_members").select("shop_id,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
      if(!member)return json({error:"Active shop membership required."},403);
      const sub=body.subscription||{};
      const endpoint=String(sub.endpoint||"");
      if(!endpoint)return json({error:"Push subscription endpoint required."},400);
      if(action==="unsubscribe"){
        await admin.from("push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("endpoint",endpoint).eq("user_id",user.id);
        return json({ok:true});
      }
      const p256dh=String(sub.keys?.p256dh||"");const authKey=String(sub.keys?.auth||"");
      if(!p256dh||!authKey)return json({error:"Push subscription keys missing."},400);
      const {error}=await admin.from("push_subscriptions").upsert({shop_id:member.shop_id,user_id:user.id,endpoint,p256dh,auth:authKey,user_agent:String(req.headers.get("user-agent")||"").slice(0,500),active:true,updated_at:new Date().toISOString()},{onConflict:"endpoint"});
      if(error)throw error;
      return json({ok:true,shop_id:member.shop_id});
    }

    if(action==="native_subscribe"||action==="native_unsubscribe"){
      const auth=req.headers.get("Authorization")||"";
      if(!auth)return json({error:"Authentication required."},401);
      const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
      const {data:{user}}=await userClient.auth.getUser();
      if(!user)return json({error:"Authentication required."},401);
      const token=String(body.token||"").trim();
      if(token.length<20||token.length>4096)return json({error:"Invalid Android device token."},400);
      if(action==="native_unsubscribe"){
        const {error}=await admin.from("native_push_tokens").update({active:false,updated_at:new Date().toISOString()}).eq("token",token).eq("user_id",user.id);
        if(error)throw error;
        return json({ok:true});
      }
      const sid=String(body.shop_id||"").trim();
      if(!sid)return json({error:"Select a shop first."},400);
      const {data:member}=await admin.from("shop_members").select("shop_id").eq("shop_id",sid).eq("user_id",user.id).eq("status","active").maybeSingle();
      if(!member)return json({error:"No active membership in this shop."},403);
      if(!nativePushConfigured())return json({error:"Native Android push is not configured on the server."},503);
      const {error}=await admin.from("native_push_tokens").upsert({token,shop_id:sid,user_id:user.id,platform:"android",active:true,updated_at:new Date().toISOString()},{onConflict:"token"});
      if(error)throw error;
      return json({ok:true});
    }

    if(action==="notify_intake"){
      const {data:expected,error:secretError}=await admin.rpc("get_intake_internal_secret");
      const supplied=req.headers.get("x-intake-internal-token")||"";
      if(secretError||!expected||supplied!==expected)return json({error:"Forbidden"},403);
      const intakeId=String(body.intake_id||"");
      if(!intakeId)return json({error:"Intake id required."},400);
      const {data:i,error:ierr}=await admin.from("intake_submissions").select("id,shop_id,customer_name,vehicle,created_at,push_notified_at,status").eq("id",intakeId).maybeSingle();
      if(ierr||!i)return json({error:"Intake not found."},404);
      if(i.status!=="new")return json({ok:true,skipped:"not_new"});
      if(i.push_notified_at)return json({ok:true,skipped:"already_notified"});
      if(Date.now()-new Date(i.created_at).getTime()>10*60*1000)return json({ok:true,skipped:"too_old"});
      const {data:claim}=await admin.from("intake_submissions").update({push_notified_at:new Date().toISOString()}).eq("id",intakeId).is("push_notified_at",null).select("id").maybeSingle();
      if(!claim)return json({ok:true,skipped:"already_claimed"});
      const [{data:subs},{data:native}] = await Promise.all([
        admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("shop_id",i.shop_id).eq("active",true),
        admin.from("native_push_tokens").select("token").eq("shop_id",i.shop_id).eq("active",true)
      ]);
      const v=i.vehicle||{};const vehicle=[v.year,v.make,v.model].filter(Boolean).join(" ");
      let sent=0;
      if(subs?.length){
        const cfg=await vapid();
        webpush.setVapidDetails("https://mobile-mechanic.app",cfg.public_key,cfg.private_key);
        const payload=JSON.stringify({title:"Mobile Mechanic AI",body:`New customer${i.customer_name?`: ${i.customer_name}`:""}${vehicle?` — ${vehicle}`:""}`,url:"./#dashboard",tag:`intake-${i.id}`});
        for(const s of subs){
          try{
            await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload,{TTL:300,urgency:"high"});
            sent++;
          }catch(err:any){
            const code=Number(err?.statusCode||0);
            if(code===404||code===410)await admin.from("push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("id",s.id);
            console.error("push failed",code,err?.message||err);
          }
        }
      }
      if(nativePushConfigured()&&native?.length){
        const {count}=await admin.from("intake_submissions").select("id",{count:"exact",head:true}).eq("shop_id",i.shop_id).eq("status","new");
        try{
          const outcome=await sendNativeIntakePush({
            tokens:native.map(s=>s.token),intakeId:i.id,
            customer:i.customer_name||"",vehicle,pendingCount:Number(count||1)
          });
          sent+=outcome.sent;
          for(const token of outcome.invalid){
            await admin.from("native_push_tokens").update({active:false,updated_at:new Date().toISOString()}).eq("token",token);
          }
        }catch(err){console.error("Native push failed",err);}
      }
      if(sent===0)await admin.from("intake_submissions").update({push_notified_at:null}).eq("id",intakeId);
      return json({ok:true,sent});
    }

    return json({error:"Unknown action."},400);
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Push notification failed."},500);}
});
