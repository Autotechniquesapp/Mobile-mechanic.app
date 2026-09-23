import { createClient } from "npm:@supabase/supabase-js@2.112.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL")!;const anon=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");const auth=req.headers.get("Authorization")||"";
 const userClient=createClient(supabaseUrl,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
 const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:"Authentication required."},401);
 const {data:member}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!member)return json({error:"Active shop membership required."},403);
 const body=await req.json().catch(()=>({}));if(String(body.action||"deliver_queued")!=="deliver_queued")return json({error:"Unknown action."},400);
 const {data:rows,error}=await admin.from("outbound_messages").select("*").eq("shop_id",member.shop_id).eq("status","queued").order("created_at",{ascending:true}).limit(Math.min(25,Math.max(1,Number(body.limit||10))));if(error)return json({error:error.message},500);
 const {data:intRows}=await admin.from("shop_integrations").select("provider,status").eq("shop_id",member.shop_id);const connected=new Set((intRows||[]).filter((x:any)=>x.status==="connected").map((x:any)=>x.provider));
 async function invokeFn(fn:string,payload:any){const r=await fetch(`${supabaseUrl}/functions/v1/${fn}`,{method:"POST",headers:{Authorization:auth,apikey:anon,"Content-Type":"application/json"},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok||d?.error){const e:any=new Error(d?.error||`${fn} failed (${r.status}).`);e.code=d?.code;e.details=d;throw e;}return d;}
 async function invokeAction(action:string,payload:any){return invokeFn("integration-actions",{action,...payload});}
 async function resend(m:any){const key=Deno.env.get("RESEND_API_KEY")||"",from=Deno.env.get("RESEND_FROM_EMAIL")||Deno.env.get("EMAIL_FROM")||"";if(!key||!from)throw new Error("No connected email service is available.");const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[m.recipient],subject:m.subject||"Mobile Mechanic AI",text:m.body})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.message||"Email delivery failed.");return {provider:"resend",id:d.id||null};}
 const results=[] as any[];
 for(const m of rows||[]){
  try{
   let provider="",id:any=null;
   if(m.channel==="email"){
    if(connected.has("gmail")){const d=await invokeAction("gmail.send",{to:m.recipient,subject:m.subject||"Mobile Mechanic AI",text:m.body});provider="gmail";id=d.message_id||null;}
    else if(connected.has("microsoft_email")){const d=await invokeAction("microsoft_email.send",{to:m.recipient,subject:m.subject||"Mobile Mechanic AI",text:m.body});provider="microsoft_email";id=d.message_id||null;}
    else {const d=await resend(m);provider=d.provider;id=d.id;}
   }else if(m.channel==="sms"){
    const d=await invokeFn("sms-send",{action:"send",to:m.recipient,text:m.body});provider="twilio";id=d.message_id||null;
   }else throw new Error("Unsupported message channel.");
   await admin.from("outbound_messages").update({status:"sent",provider,provider_message_id:id,error:null,sent_at:new Date().toISOString()}).eq("id",m.id).eq("status","queued");
   results.push({id:m.id,status:"sent",provider});
  }catch(err:any){const msg=err instanceof Error?err.message:"Delivery failed.";const retryable=["TWILIO_NEEDS_SETUP","SMS_PACK_REQUIRED","SMS_PACK_LIMIT"].includes(String(err?.code||""));await admin.from("outbound_messages").update({status:retryable?"queued":"failed",error:msg,provider:null}).eq("id",m.id).eq("status","queued");results.push({id:m.id,status:retryable?"queued":"failed",error:msg,code:err?.code||null});}
 }
 return json({ok:true,processed:results.length,results});
});