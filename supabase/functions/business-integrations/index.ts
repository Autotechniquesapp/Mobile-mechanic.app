import { createClient } from "npm:@supabase/supabase-js@2.112.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envAny(...names:string[]){for(const n of names){const v=Deno.env.get(n);if(v)return v;}return "";}
const catalog=[
 {provider:"quickbooks",name:"QuickBooks Online",category:"Accounting",connector:"quickbooks-oauth",configured:()=>!!(envAny("QUICKBOOKS_CLIENT_ID","INTUIT_CLIENT_ID")&&envAny("QUICKBOOKS_CLIENT_SECRET","INTUIT_CLIENT_SECRET")),note:"Authorize your accounting account. Customer, invoice and payment sync is not available yet."},
 {provider:"xero",name:"Xero",category:"Accounting",connector:"xero-oauth",configured:()=>!!(envAny("XERO_CLIENT_ID")&&envAny("XERO_CLIENT_SECRET")),note:"Authorize one Xero organization. Customer, invoice and payment sync is not available yet."},
 {provider:"google_calendar",name:"Google Calendar",category:"Calendar",connector:"google-business-oauth",configured:()=>!!(envAny("GOOGLE_CLIENT_ID")&&envAny("GOOGLE_CLIENT_SECRET")),note:"Put scheduled jobs on the shop calendar."},
 {provider:"microsoft_calendar",name:"Outlook Calendar",category:"Calendar",connector:"microsoft-business-oauth",configured:()=>!!(envAny("MICROSOFT_CLIENT_ID")&&envAny("MICROSOFT_CLIENT_SECRET")),note:"Sync jobs to Microsoft 365 calendars."},
 {provider:"gmail",name:"Gmail",category:"Communication",connector:"google-business-oauth",configured:()=>!!(envAny("GOOGLE_CLIENT_ID")&&envAny("GOOGLE_CLIENT_SECRET")),note:"Send estimates, invoices and follow-ups from Gmail."},
 {provider:"microsoft_email",name:"Microsoft Email",category:"Communication",connector:"microsoft-business-oauth",configured:()=>!!(envAny("MICROSOFT_CLIENT_ID")&&envAny("MICROSOFT_CLIENT_SECRET")),note:"Send shop email through Microsoft 365."},
 {provider:"twilio",name:"Twilio SMS",category:"Communication",connector:null,configured:()=>!!(envAny("TWILIO_ACCOUNT_SID")&&envAny("TWILIO_AUTH_TOKEN")&&envAny("TWILIO_FROM_NUMBER")),note:"Customer texts, reminders and status updates."},
 {provider:"google_maps",name:"Google Maps",category:"Location & Vehicle",connector:null,configured:()=>!!envAny("GOOGLE_MAPS_API_KEY"),note:"Travel distance, routing and nearby parts stores."},
 {provider:"vin_lookup",name:"VIN / Plate Lookup",category:"Location & Vehicle",connector:null,configured:()=>!!envAny("VIN_API_KEY","VEHICLE_DATA_API_KEY"),note:"Auto-fill vehicle details from VIN or plate."},
 {provider:"carfax",name:"CARFAX",category:"Location & Vehicle",connector:null,configured:()=>!!envAny("CARFAX_API_KEY","CARFAX_CLIENT_ID"),note:"Authorized service-history reporting."},
 {provider:"parts_suppliers",name:"Parts Suppliers",category:"Parts & Automation",connector:null,configured:()=>!!envAny("PARTS_SUPPLIER_API_KEY"),note:"Parts sourcing and future price/inventory lookups."},
 {provider:"zapier",name:"Zapier / Make",category:"Parts & Automation",connector:null,configured:()=>!!envAny("ZAPIER_WEBHOOK_URL","MAKE_WEBHOOK_URL"),note:"Connect shop events to hundreds of other apps."},
 {provider:"google_drive",name:"Google Drive",category:"Files",connector:"google-business-oauth",configured:()=>!!(envAny("GOOGLE_CLIENT_ID")&&envAny("GOOGLE_CLIENT_SECRET")),note:"Export invoices, receipts and reports to Drive."},
 {provider:"dropbox",name:"Dropbox",category:"Files",connector:null,configured:()=>!!(envAny("DROPBOX_CLIENT_ID")&&envAny("DROPBOX_CLIENT_SECRET")),note:"Store exported shop documents."},
 {provider:"onedrive",name:"OneDrive",category:"Files",connector:"microsoft-business-oauth",configured:()=>!!(envAny("MICROSOFT_CLIENT_ID")&&envAny("MICROSOFT_CLIENT_SECRET")),note:"Export documents to Microsoft OneDrive."}
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
 const body=await req.json().catch(()=>({}));const action=String(body.action||"status");const provider=String(body.provider||"");const item=catalog.find(x=>x.provider===provider);
 if(action==="disconnect"){
  if(!item)return json({error:"Unknown integration."},400);
  if(!["shop_owner","manager"].includes(member.role))return json({error:"Only a shop owner or manager can disconnect integrations."},403);
  await admin.from("shop_integration_credentials").delete().eq("shop_id",member.shop_id).eq("provider",provider);
  await admin.from("shop_integrations").upsert({shop_id:member.shop_id,provider,status:"not_connected",external_account_id:null,display_name:null,public_settings:{},last_error:null,last_synced_at:null,updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
  return json({ok:true});
 }
 if(action==="enable"){
  if(!item)return json({error:"Unknown integration."},400);
  if(!["shop_owner","manager"].includes(member.role))return json({error:"Only a shop owner or manager can enable integrations."},403);
  if(item.connector)return json({error:"This integration requires account authorization."},409);
  if(!item.configured())return json({error:`${item.name} still needs its platform credentials before it can be enabled.`,code:"needs_keys"},503);
  await admin.from("shop_integrations").upsert({shop_id:member.shop_id,provider,status:"connected",display_name:item.name,public_settings:{shared_platform_service:true},last_error:null,last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"shop_id,provider"});
  return json({ok:true});
 }
 if(action!=="status")return json({error:"Unknown action."},400);
 const {data:rows,error}=await admin.from("shop_integrations").select("provider,status,external_account_id,display_name,public_settings,last_error,last_synced_at").eq("shop_id",member.shop_id);if(error)return json({error:error.message},500);
 const by=Object.fromEntries((rows||[]).map((r:any)=>[r.provider,r]));
 return json({integrations:catalog.map(c=>({...(by[c.provider]||{provider:c.provider,status:"not_connected"}),name:c.name,category:c.category,connector:c.connector,configured:c.configured(),note:c.note}))});
});
