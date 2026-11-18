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

  const busy:{start:string,end:string,source:"shop"|"google"|"outlook"}[]=[];
  const {data:jobs,error:jobsError}=await admin.from("jobs")
    .select("scheduled_start_at,scheduled_end_at,status")
    .eq("shop_id",shop.shop_id)
    .not("scheduled_start_at","is",null)
    .lt("scheduled_start_at",end.toISOString())
    .gt("scheduled_end_at",start.toISOString());
  if(jobsError)return json({error:"Shop availability unavailable."},503);
  for(const j of jobs||[]){
    const state=String(j.status||"").toLowerCase();
    if(state==="completed"||state==="cancelled"||state.includes("declined"))continue;
    if(j.scheduled_start_at&&j.scheduled_end_at)busy.push({start:j.scheduled_start_at,end:j.scheduled_end_at,source:"shop"});
  }

  const {data:integrations,error:integrationError}=await admin.from("shop_integrations")
    .select("provider,status").eq("shop_id",shop.shop_id).in("provider",["google_calendar","microsoft_calendar"]);
  if(integrationError)return json({error:"Calendar connections unavailable."},503);
  const connected=(provider:string)=>integrations?.some(row=>row.provider===provider&&row.status==="connected")??false;
  let googleConnected=connected("google_calendar");
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
        u.searchParams.set("fields","nextPageToken,items(start,end,status,transparency)");
        const gr=await fetch(u,{headers:{Authorization:`Bearer ${c.access_token}`}});
        const gd=await gr.json().catch(()=>({}));
        if(gr.ok&&!gd.nextPageToken){
          for(const ev of gd.items||[]){
            if(ev.status==="cancelled"||ev.transparency==="transparent")continue;
            const s=ev.start?.dateTime||ev.start?.date,e=ev.end?.dateTime||ev.end?.date;
            if(s&&e)busy.push({start:new Date(s).toISOString(),end:new Date(e).toISOString(),source:"google"});
          }
        } else googleConnected=false;
      }
    } else googleConnected=false;
  }

  let outlookChecked=!connected("microsoft_calendar");
  if(!outlookChecked){
    const {data:credentials}=await admin.from("shop_integration_credentials").select("*")
      .eq("shop_id",shop.shop_id).eq("provider","microsoft_calendar").maybeSingle();
    let access=credentials?.access_token;
    const expires=Date.parse(credentials?.token_expires_at||"");
    if(expires<Date.now()+120000&&credentials?.refresh_token){
      const tenant=Deno.env.get("MICROSOFT_TENANT_ID")||"common";
      const form=new URLSearchParams({
        client_id:Deno.env.get("MICROSOFT_CLIENT_ID")||"",
        client_secret:Deno.env.get("MICROSOFT_CLIENT_SECRET")||"",
        refresh_token:credentials.refresh_token,grant_type:"refresh_token"
      });
      const refresh=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,{
        method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form
      });
      const token=await refresh.json().catch(()=>({}));
      access=refresh.ok?token.access_token:null;
      if(access){
        await admin.from("shop_integration_credentials").update({
          access_token:access,refresh_token:token.refresh_token||credentials.refresh_token,
          token_expires_at:addSeconds(Number(token.expires_in||3600)),updated_at:new Date().toISOString()
        }).eq("shop_id",shop.shop_id).eq("provider","microsoft_calendar");
      }
    }
    if(access){
      const view=new URL("https://graph.microsoft.com/v1.0/me/calendarView");
      view.searchParams.set("startDateTime",start.toISOString());
      view.searchParams.set("endDateTime",end.toISOString());
      view.searchParams.set("$select","start,end,showAs,isCancelled");
      view.searchParams.set("$top","1000");
      const response=await fetch(view,{headers:{Authorization:`Bearer ${access}`,Prefer:'outlook.timezone="UTC"'}});
      const result=await response.json().catch(()=>({}));
      if(response.ok&&Array.isArray(result.value)&&!result["@odata.nextLink"]){
        outlookChecked=true;
        for(const event of result.value){
          if(event.isCancelled||event.showAs==="free")continue;
          const utc=(value:unknown)=>typeof value==="string"&&validIso(/[zZ]|[+-]\d{2}:\d{2}$/.test(value)?value:value+"Z");
          const from=utc(event.start?.dateTime),to=utc(event.end?.dateTime);
          if(!from||!to){outlookChecked=false;break;}
          busy.push({start:from.toISOString(),end:to.toISOString(),source:"outlook"});
        }
      }
    }
  }

  busy.sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime());
  const merged:{start:string,end:string}[]=[];
  for(const row of busy){
    const last=merged[merged.length-1];
    if(last&&overlap(last.start,last.end,row.start,row.end)){
      if(new Date(row.end)>new Date(last.end))last.end=row.end;
    }else merged.push({start:row.start,end:row.end});
  }
  return json({ok:true,shop_id:shop.shop_id,google_connected:googleConnected,calendar_check_failed:!outlookChecked||(connected("google_calendar")&&!googleConnected),busy:merged});
});