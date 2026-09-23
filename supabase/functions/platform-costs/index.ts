import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")||"";
    const anon=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const auth=req.headers.get("Authorization")||"";
    if(!url||!anon||!service||!auth)return json({error:"Unauthorized"},401);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return json({error:"Unauthorized"},401);
    const {data:pa}=await admin.from("platform_admins").select("role,active").eq("user_id",user.id).eq("active",true).maybeSingle();
    if(!pa)return json({error:"Platform admin access required."},403);

    const now=new Date();
    const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();
    const [ints,ai,sms,shops,push,storage]=await Promise.all([
      admin.from("platform_integrations").select("provider,display_name,status,mode,public_settings,last_error,updated_at").order("provider"),
      admin.from("ai_usage_ledger").select("provider_cost_cents,billable_cost_cents,feature,model,created_at").gte("created_at",monthStart),
      admin.from("feature_usage_events").select("id,created_at").eq("feature","sms_sent").gte("created_at",monthStart),
      admin.from("shops").select("shop_id,billing_status"),
      admin.from("push_subscriptions").select("id").eq("active",true),
      admin.schema("storage").from("objects").select("metadata")
    ]);
    const aiRows=ai.data||[];
    const providerCostCents=aiRows.reduce((s:any,r:any)=>s+Number(r.provider_cost_cents||0),0);
    const billableCostCents=aiRows.reduce((s:any,r:any)=>s+Number(r.billable_cost_cents||0),0);
    const storageBytes=(storage.data||[]).reduce((s:any,r:any)=>s+Number(r?.metadata?.size||0),0);
    const shopRows=shops.data||[];
    return json({ok:true,role:pa.role,month_start:monthStart,integrations:ints.data||[],metrics:{ai_calls_mtd:aiRows.length,ai_provider_cost_cents_mtd:providerCostCents,ai_billable_cents_mtd:billableCostCents,sms_sent_mtd:(sms.data||[]).length,total_shops:shopRows.length,trialing_shops:shopRows.filter((s:any)=>s.billing_status==="trialing").length,active_push_devices:(push.data||[]).length,storage_bytes:storageBytes}});
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Platform cost status failed."},500);}
});