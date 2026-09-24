import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){
  try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}
  return Deno.env.get(legacyName)||"";
}
const addSeconds=(s:number)=>new Date(Date.now()+Math.max(0,s)*1000).toISOString();
const validIso=(v:unknown)=>{const d=new Date(String(v||""));return Number.isNaN(d.getTime())?null:d;};
const overlap=(a0:string,a1:string,b0:string,b1:string)=>new Date(a0).getTime()<new Date(b1).getTime()&&new Date(a1).getTime()>new Date(b0).getTime();

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);

  const body=await req.json().catch(()=>({}));
  const shopId=String(body.shop_id||"").trim();
  const shopSlug=String(body.shop_slug||"").trim().toLowerCase();
  const start=validIso(body.range_start),end=validIso(body.range_end);
  if((!shopId&&!shopSlug)||!start||!end)return json({error:"Shop and a valid date range are required."},400);
  if(end.getTime()<=start.getTime()||end.getTime()-start.getTime()>31*86400000)return json({error:"Availability range must be between 1 minute and 31 days."},400);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
  const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});

  let q=admin.from("shops").select("shop_id,slug,name").limit(1);
  q=shopId?q.eq("shop_id",shopId):q.eq("slug",shopSlug);
  const {data:shop,error:shopErr}=await q.maybeSingle();
  if(shopErr||!shop)return json({error:"Shop not found."},404);

  const busy:{start:string,end:string,source:"shop"|"google"}[]=[];
  const {data:jobs}=await admin.from("jobs")
    .select("scheduled_start_at,scheduled_end_at,status")
    .eq("shop_id",shop.shop_id)
    .not("scheduled_start_at","is",null)
    .lt("scheduled_start_at",end.toISOString())
    .gt("scheduled_end_at",start.toISOString());
  for(const j of jobs||[]){
    const state=String(j.status||"").toLowerCase();
    if(state==="completed"||state==="cancelled"||state.includes("declined"))continue;
    if(j.scheduled_start_at&&j.scheduled_end_at)busy.push({start:j.scheduled_start_at,end:j.scheduled_end_at,source:"shop"});
  }

  const {data:int}=await admin.from("shop_integrations").select("status").eq("shop_id",shop.shop_id).eq("provider","google_calendar").maybeSingle();
  let googleConnected=int?.status==="connected";
  if(googleConnected){
    let {data:c}=await admin.from("shop_integration_credentials").select("*").eq("shop_id",shop.shop_id).eq("provider","google_calendar").maybeSingle();
    if(c?.access_token){
      const exp=c.token_expires_at?new Date(c.token_expires_at).getTime():0;
      if(exp&&exp<Date.now()+120000&&c.refresh_token){
        const id=Deno.env.get("GOOGLE_CLIENT_ID")||"",secret=Deno.env.get("GOOGLE_CLIENT_SECRET")||"";
        const f=new URLSearchParams({client_id:id,client_secret:secret,refresh_token:c.refresh_token,grant_type:"refresh_token"});
        const rr=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:f});
        const t=await rr.json().catch(()=>({}));
        if(rr.ok&&t.access_token){
          c={...c,access_token:t.access_token,token_expires_at:addSeconds(Number(t.expires_in||3600))};
          await admin.from("shop_integration_credentials").update({
            access_token:c.access_token,token_expires_at:c.token_expires_at,updated_at:new Date().toISOString()
          }).eq("shop_id",shop.shop_id).eq("provider","google_calendar");
        } else googleConnected=false;
      }
      if(googleConnected){
        const u=new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
        u.searchParams.set("timeMin",start.toISOString());u.searchParams.set("timeMax",end.toISOString());
        u.searchParams.set("singleEvents","true");u.searchParams.set("showDeleted","false");u.searchParams.set("maxResults","2500");
        u.searchParams.set("fields","items(start,end,status,transparency)");
        const gr=await fetch(u,{headers:{Authorization:`Bearer ${c.access_token}`}});
        const gd=await gr.json().catch(()=>({}));
        if(gr.ok){
          for(const ev of gd.items||[]){
            if(ev.status==="cancelled"||ev.transparency==="transparent")continue;
            const s=ev.start?.dateTime||ev.start?.date,e=ev.end?.dateTime||ev.end?.date;
            if(s&&e)busy.push({start:new Date(s).toISOString(),end:new Date(e).toISOString(),source:"google"});
          }
        } else googleConnected=false;
      }
    } else googleConnected=false;
  }

  busy.sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime());
  const merged:{start:string,end:string}[]=[];
  for(const row of busy){
    const last=merged[merged.length-1];
    if(last&&overlap(last.start,last.end,row.start,row.end)){
      if(new Date(row.end)>new Date(last.end))last.end=row.end;
    }else merged.push({start:row.start,end:row.end});
  }
  return json({ok:true,shop_id:shop.shop_id,google_connected:googleConnected,busy:merged});
});