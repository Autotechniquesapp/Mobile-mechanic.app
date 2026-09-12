import { createClient } from "npm:@supabase/supabase-js@2.112.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envAny(...names:string[]){for(const n of names){const v=Deno.env.get(n);if(v)return v;}return "";}
const catalog=[
 {provider:"quickbooks",name:"QuickBooks Online",category:"Accounting",connector:"quickbooks-oauth",configured:()=>!!(envAny("QUICKBOOKS_CLIENT_ID","INTUIT_CLIENT_ID")&&envAny("QUICKBOOKS_CLIENT_SECRET","INTUIT_CLIENT_SECRET")),note:"Each shop authorizes its own QuickBooks company. Platform developer credentials are required once."},
 {provider:"xero",name:"Xero",category:"Accounting",connector:"xero-oauth",configured:()=>!!(envAny("XERO_CLIENT_ID")&&envAny("XERO_CLIENT_SECRET")),note:"Each shop authorizes its own Xero organization. Platform developer credentials are required once."},
 {provider:"google_calendar",name:"Google Calendar",category:"Calendar",connector:"google-business-oauth",configured:()=>!!(envAny("GOOGLE_CLIENT_ID")&&envAny("GOOGLE_CLIENT_SECRET")),note:"Put scheduled jobs on the shop calendar."},
 {provider:"microsoft_calendar",name:"Microsoft 365 / Outlook Calendar",category:"Calendar",connector:"microsoft-business-oauth",configured:()=>!!(envAny("MICROSOFT_CLIENT_ID")&&envAny("MICROSOFT_CLIENT_SECRET")),note:"Sync scheduled jobs to the shop's Outlook / Microsoft 365 calendar."},
 {provider:"gmail",name:"Gmail",category:"Communication",connector:"google-business-oauth",configured:()=>!!(envAny("GOOGLE_CLIENT_ID")&&envAny("GOOGLE_CLIENT_SECRET")),note:"Send estimates, invoices and follow-ups from the shop's Gmail account."},
 {provider:"microsoft_email",name:"Microsoft 365 / Outlook Email",category:"Communication",connector:"microsoft-business-oauth",configured:()=>!!(envAny("MICROSOFT_CLIENT_ID")&&envAny("MICROSOFT_CLIENT_SECRET")),note:"Send estimates, invoices and follow-ups from the shop's Outlook / Microsoft 365 mailbox."},
 {provider:"twilio",name:"Automatic SMS",category:"Communication",connector:null,configured:()=>!!(envAny("MMA_TWILIO_ACCOUNT_SID")&&envAny("MMA_TWILIO_AUTH_TOKEN")&&(envAny("MMA_TWILIO_FROM_NUMBER")||envAny("MMA_TWILIO_MESSAGING_SERVICE_SID"))),note:"Shared platform SMS with a server-enforced 100-message allowance per active SMS pack. Device SMS fallback stays available."},
 {provider:"google_maps",name:"OpenStreetMap / Leaflet",category:"Location & Vehicle",connector:null,configured:()=>true,alwaysOn:true,builtInName:"OpenStreetMap / Leaflet",note:"Free built-in maps, GPS and nearby parts-store lookup. No Google Maps API key required."},
 {provider:"vin_lookup",name:"VIN Lookup (NHTSA)",category:"Location & Vehicle",connector:null,configured:()=>true,alwaysOn:true,builtInName:"NHTSA vPIC",note:"Live VIN decoding through NHTSA vPIC. Plate lookup can be added later through a licensed provider."},
 {provider:"carfax",name:"CARFAX",category:"Location & Vehicle",connector:null,configured:()=>!!envAny("CARFAX_API_KEY","CARFAX_CLIENT_ID"),note:"CARFAX service-history reporting requires partner/service-network approval before production reporting."},
 {provider:"parts_suppliers",name:"Commercial Parts Ordering",category:"Parts & Automation",connector:null,configured:()=>!!envAny("PARTS_SUPPLIER_API_KEY"),note:"Live price/inventory ordering requires approved supplier access such as AutoZone Pro, O'Reilly First Call or NAPA integration."},
 {provider:"zapier",name:"Zapier / Make",category:"Parts & Automation",connector:null,configured:()=>!!envAny("ZAPIER_WEBHOOK_URL","MAKE_WEBHOOK_URL"),note:"Optional automation webhook. A shop can use this only if it wants an outside automation service."},
 {provider:"google_drive",name:"Google Drive",category:"Files",connector:"google-business-oauth",configured:()=>!!(envAny("GOOGLE_CLIENT_ID")&&envAny("GOOGLE_CLIENT_SECRET")),note:"Export invoices, receipts and reports to the shop's Drive."},
 {provider:"onedrive",name:"Microsoft OneDrive",category:"Files",connector:"microsoft-business-oauth",configured:()=>!!(envAny("MICROSOFT_CLIENT_ID")&&envAny("MICROSOFT_CLIENT_SECRET")),note:"Back up completed service records, invoices, receipts and reports to the shop's Microsoft OneDrive."}
];
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
 let anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 try{if(!anon)anon=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||"";}catch{}
 try{if(!service)service=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{}
 const auth=req.headers.get("Authorization")||"";
 const userClient=createClient(supabaseUrl,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
 const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:"Authentication required."},401);
 const {data:member}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!member)return json({error:"Active shop membership required."},403);
 const body=await req.json().catch(()=>({}));const action=String(body.action||"status");const provider=String(body.provider||"");const item:any=catalog.find((x:any)=>x.provider===provider);
 if(action==="disconnect"){
  if(!item)return json({error:"Unknown integration."},400);
  if(item.alwaysOn)return json({error:"This built-in integration cannot be disconnected."},409);
  if(!["shop_owner","manager"].includes(member.role))return json({error:"Only a shop owner or manager can disconnect integrations."},403);
  await admin.from("shop_integration_credentials").delete().eq("shop_id",member.shop_id).eq("provider",provider);
  await admin.from("shop_integrations").upsert({shop_id:member.shop_id,provider,status:"not_connected",external_account_id:null,display_name:null,public_settings:{},last_error:null,last_synced_at:null,updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
  return json({ok:true});
 }
 if(action==="enable"){
  if(!item)return json({error:"Unknown integration."},400);
  if(!["shop_owner","manager"].includes(member.role))return json({error:"Only a shop owner or manager can enable integrations."},403);
  if(item.alwaysOn)return json({ok:true,already_enabled:true});
  if(item.connector)return json({error:"This integration requires account authorization."},409);
  if(!item.configured())return json({error:`${item.name} still needs its platform credentials or vendor approval before it can be enabled.`,code:"needs_keys"},503);
  await admin.from("shop_integrations").upsert({shop_id:member.shop_id,provider,status:"connected",display_name:item.name,public_settings:{shared_platform_service:true},last_error:null,last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
  return json({ok:true});
 }
 if(action!=="status")return json({error:"Unknown action."},400);
 const {data:rows,error}=await admin.from("shop_integrations").select("provider,status,external_account_id,display_name,public_settings,last_error,last_synced_at").eq("shop_id",member.shop_id);if(error)return json({error:error.message},500);
 const by=Object.fromEntries((rows||[]).map((r:any)=>[r.provider,r]));
 return json({integrations:catalog.map((c:any)=>{const builtIn={provider:c.provider,status:"connected",display_name:c.builtInName||c.name,public_settings:{source:c.builtInName||c.name,built_in:true}};const base=c.alwaysOn?builtIn:(by[c.provider]||{provider:c.provider,status:"not_connected"});return {...base,name:c.name,category:c.category,connector:c.connector,configured:c.configured(),always_on:!!c.alwaysOn,note:c.note};})});
});