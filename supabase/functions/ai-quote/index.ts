import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function envKey(jsonName:string,legacyName:string){try{const p=JSON.parse(Deno.env.get(jsonName)||"{}");if(p?.default)return p.default;}catch{}return Deno.env.get(legacyName)||"";}
function providerFallback(job:any,shop:any,knownParts:any){
  const rate=money(shop?.labor_rate||75),parts=knownParts==null?0:money(knownParts),travel=money(shop?.travel_fee||0),markup=clamp(shop?.parts_markup||0,0,300),taxRate=clamp(shop?.tax_rate||0,0,25);
  const build=(title:string,hours:number,summary:string)=>{const marked=parts*(1+markup/100),subtotal=marked+hours*rate+travel,total=money(subtotal+subtotal*(taxRate/100));return {title,price:total,summary};};
  return {ok:true,fallback:true,provider_notice:"AI provider billing is unavailable. This is a basic mechanic-review draft, not an AI diagnosis.",estimate:{good:build("Diagnostic testing",1,"Confirm the complaint, scan all systems, and test before replacing parts."),better:build("Diagnostic testing and likely repair",2,"Diagnostic time plus provisional labor. Verify the repair scope and parts before sending."),best:build("Complete verified repair",3,"Provisional complete-repair allowance. Replace this draft with confirmed parts and labor before customer approval.")},breakdown:{},warning:"Provider unavailable. Verify every price, part, labor hour, tax, and repair item before saving or sending."};
}
function outputText(data:any){if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text.trim();const out:string[]=[];for(const item of data?.output||[])for(const c of item?.content||[])if(c?.type==="output_text"&&c?.text)out.push(c.text);return out.join("\n").trim();}
const money=(n:unknown)=>Math.round(Math.max(0,Number(n||0))*100)/100;
const clamp=(n:unknown,min:number,max:number)=>Math.min(max,Math.max(min,Number(n||0)));
const safe=(v:unknown,max=4000)=>String(v??"").slice(0,max);

async function creditState(admin:any,shopId:string,trialExpiresAt:any){
  const {data,error}=await admin.from("ai_credit_transactions").select("amount_cents,credit_bucket").eq("shop_id",shopId);if(error)throw error;
  let promotional=0,purchased=0;for(const r of data||[]){const n=Number(r.amount_cents||0);if(r.credit_bucket==="promotional")promotional+=n;else purchased+=n;}
  const end=trialExpiresAt?new Date(trialExpiresAt).getTime():0;const trialActive=Boolean(end&&Date.now()<end);if(!trialActive)promotional=0;
  return {promotional:Math.max(0,promotional),purchased,total:Math.max(0,promotional)+purchased,trialActive};
}
async function meterAI(admin:any,args:{shopId:string,userId:string|null,feature:string,model:string,response:any,trialExpiresAt:any,metadata?:any}){
  const responseId=String(args.response?.id||"");if(!responseId)return 0;
  const {data:existing}=await admin.from("ai_usage_ledger").select("id,billable_cost_cents").eq("openai_response_id",responseId).maybeSingle();if(existing)return Number(existing.billable_cost_cents||0);
  const {data:rate,error:rateError}=await admin.from("ai_model_rates").select("input_per_million,cached_input_per_million,output_per_million").eq("model",args.model).eq("active",true).maybeSingle();if(rateError||!rate)throw rateError||new Error(`AI rate not configured for ${args.model}.`);
  const u=args.response?.usage||{},input=Number(u.input_tokens||0),cached=Math.min(input,Number(u.input_tokens_details?.cached_tokens||0)),output=Number(u.output_tokens||0),nonCached=Math.max(0,input-cached);
  const cents=Number((((nonCached*Number(rate.input_per_million)+cached*Number(rate.cached_input_per_million)+output*Number(rate.output_per_million))/1_000_000)*100).toFixed(6));
  const state=await creditState(admin,args.shopId,args.trialExpiresAt);const promoDebit=Math.min(Math.max(0,cents),state.promotional),purchasedDebit=Math.max(0,cents-promoDebit);
  if(promoDebit>0){const {error}=await admin.from("ai_credit_transactions").insert({shop_id:args.shopId,kind:"usage",amount_cents:-promoDebit,source:args.feature,reference_id:`ai_usage:${responseId}:promo`,credit_bucket:"promotional",metadata:{model:args.model,...(args.metadata||{})}});if(error&&error.code!=="23505")throw error;}
  if(purchasedDebit>0){const {error}=await admin.from("ai_credit_transactions").insert({shop_id:args.shopId,kind:"usage",amount_cents:-purchasedDebit,source:args.feature,reference_id:`ai_usage:${responseId}:purchased`,credit_bucket:"purchased",metadata:{model:args.model,...(args.metadata||{})}});if(error&&error.code!=="23505")throw error;}
  const {error:ledgerError}=await admin.from("ai_usage_ledger").insert({shop_id:args.shopId,user_id:args.userId,feature:args.feature,model:args.model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,provider_cost_cents:cents,billable_cost_cents:cents,openai_response_id:responseId,metadata:args.metadata||{}});if(ledgerError&&ledgerError.code!=="23505")throw ledgerError;
  return cents;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
    const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const service=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const admin=createClient(supabaseUrl,service,{auth:{persistSession:false}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user)return json({error:"Authentication required."},401);
    const {data:member}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(!member)return json({error:"Active shop membership required."},403);
    if(!["shop_owner","owner","manager","service_writer","technician"].includes(String(member.role)))return json({error:"Your shop role cannot create estimates."},403);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"generate");
    const jobId=String(body.job_id||"");
    if(!jobId)return json({error:"job_id is required."},400);

    const {data:job}=await admin.from("jobs").select("*").eq("id",jobId).eq("shop_id",member.shop_id).single();
    if(!job)return json({error:"Job not found."},404);
    const [{data:shop},{data:vehicle},{data:customer},{data:findings}]=await Promise.all([
      admin.from("shops").select("shop_id,name,plan,labor_rate,tax_rate,parts_markup,travel_fee,trial_expires_at").eq("shop_id",member.shop_id).single(),
      admin.from("vehicles").select("year,make,model,submodel,engine,drivetrain,mileage,vin").eq("id",job.vehicle_id).eq("shop_id",member.shop_id).maybeSingle(),
      admin.from("customers").select("name,phone,email").eq("id",job.customer_id).eq("shop_id",member.shop_id).maybeSingle(),
      admin.from("technician_findings").select("finding_text,diagnostic_codes,measurements,created_at").eq("job_id",jobId).eq("shop_id",member.shop_id).order("created_at",{ascending:false}).limit(10)
    ]);

    if(action==="save"){
      const q=body.estimate;if(!q||typeof q!=="object")return json({error:"Estimate draft is required."},400);const clean:any={};
      for(const key of ["good","better","best"]){const o=q[key];if(!o||typeof o!=="object")return json({error:`${key} option is required.`},400);clean[key]={title:safe(o.title||key,80),price:money(o.price),summary:safe(o.summary,800)};}
      const {error}=await admin.from("jobs").update({estimate:clean,updated_at:new Date().toISOString()}).eq("id",jobId).eq("shop_id",member.shop_id);if(error)throw error;
      await admin.from("feature_usage_events").insert({shop_id:member.shop_id,feature:"ai_quote_save",metadata:{job_id:jobId,user_id:user.id}});return json({ok:true,estimate:clean});
    }
    if(action!=="generate")return json({error:"Unknown action."},400);
    const openaiKey=Deno.env.get("OPENAI_API_KEY")||"";if(!openaiKey)return json({error:"AI Quote is built, but the OpenAI API key is not configured in Supabase Edge Function secrets yet.",code:"openai_needs_key"},503);
    const wallet=await creditState(admin,member.shop_id,shop?.trial_expires_at);if(wallet.total<=0)return json({error:"AI balance is empty. Add AI Balance in Billing to keep using AI tools.",code:"ai_balance_empty"},402);

    const rate=money(shop?.labor_rate||75),taxRate=clamp(shop?.tax_rate||0,0,25),markup=clamp(shop?.parts_markup||0,0,300),travel=money(shop?.travel_fee||0);
    const knownParts=body.parts_cost==null||body.parts_cost===""?null:money(body.parts_cost);const extraNotes=safe(body.notes,2000);
    const context={vehicle:vehicle||{},customer_states:job.customer_states||"",codes:job.codes||"",job_findings:job.findings||"",structured_findings:findings||[],prior_ai_workup:job.ai_workup||null,shop_pricing:{labor_rate:rate,parts_markup_percent:markup,tax_rate_percent:taxRate,travel_fee:travel},known_parts_cost:knownParts,quote_notes:extraNotes};
    const model=shop?.plan==="solo"?"gpt-5.6-terra":"gpt-5.6-sol";
    const schema={type:"object",additionalProperties:false,properties:{warning:{type:"string"},good:{type:"object",additionalProperties:false,properties:{title:{type:"string"},summary:{type:"string"},labor_hours:{type:"number"},parts_cost:{type:"number"},parts_description:{type:"string"}},required:["title","summary","labor_hours","parts_cost","parts_description"]},better:{type:"object",additionalProperties:false,properties:{title:{type:"string"},summary:{type:"string"},labor_hours:{type:"number"},parts_cost:{type:"number"},parts_description:{type:"string"}},required:["title","summary","labor_hours","parts_cost","parts_description"]},best:{type:"object",additionalProperties:false,properties:{title:{type:"string"},summary:{type:"string"},labor_hours:{type:"number"},parts_cost:{type:"number"},parts_description:{type:"string"}},required:["title","summary","labor_hours","parts_cost","parts_description"]}},required:["warning","good","better","best"]};
    const instructions=`You are Mobile Mechanic AI Quote Drafting. Create a mechanic-review-only estimate draft from the supplied job facts. Never present an unconfirmed diagnosis as confirmed. If findings are insufficient, make the Good option diagnostic/inspection work rather than inventing a major repair. Labor hours and parts costs are estimates only and must be verified by the mechanic. If known_parts_cost is supplied, respect it as the mechanic-provided baseline where applicable. Do not invent OEM part numbers, torque specs, warranties, recalls, or exact manufacturer procedures. Keep customer-facing summaries plain-language and concise. Return JSON matching the schema.`;
    const resp=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${openaiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,reasoning:{effort:"medium"},instructions,input:`JOB CONTEXT\n${JSON.stringify(context,null,2)}\n\nReturn the JSON quote draft.`,text:{format:{type:"json_schema",name:"automotive_quote_draft",strict:true,schema}}})});
    const data=await resp.json().catch(()=>({}));if(!resp.ok){const e=data?.error||{},code=e?.code||e?.type||`http_${resp.status}`;if(["billing_not_active","insufficient_quota"].includes(code))return json(providerFallback(job,shop,knownParts));return json({error:e?.message||`OpenAI quote request failed (${resp.status}).`,code},502);}
    const aiCostCents=await meterAI(admin,{shopId:member.shop_id,userId:user.id,feature:"ai_quote_generate",model,response:data,trialExpiresAt:shop?.trial_expires_at,metadata:{job_id:jobId}});
    const text=outputText(data);if(!text)throw new Error("AI quote response was empty.");let draft:any;try{draft=JSON.parse(text);}catch{throw new Error("AI quote response was not valid JSON.");}
    const price=(o:any)=>{const hours=clamp(o?.labor_hours,0,100),parts=money(o?.parts_cost),marked=parts*(1+markup/100),subtotal=marked+hours*rate+travel,tax=subtotal*(taxRate/100);return {hours:money(hours),parts_cost:parts,marked_parts:money(marked),labor:money(hours*rate),travel:travel,tax:money(tax),total:money(subtotal+tax)};};
    const estimate:any={},breakdown:any={};for(const key of ["good","better","best"]){const o=draft[key]||{};const b=price(o);breakdown[key]=b;const detail=[safe(o.summary,500),o.parts_description?`Parts: ${safe(o.parts_description,240)}`:""].filter(Boolean).join(" ");estimate[key]={title:safe(o.title||key,80),price:b.total,summary:detail};}
    await admin.from("feature_usage_events").insert({shop_id:member.shop_id,feature:"ai_quote_generate",metadata:{job_id:jobId,model,ai_cost_cents:aiCostCents,breakdown,warning:safe(draft.warning,500)}});
    const after=await creditState(admin,member.shop_id,shop?.trial_expires_at);
    return json({ok:true,estimate,breakdown,warning:safe(draft.warning,500)||"AI-generated draft. Verify labor, parts, tax, and scope before sending.",model,ai_cost_cents:aiCostCents,ai_balance_cents:after.total,customer:{name:customer?.name||"",phone:customer?.phone||""}});
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"AI Quote failed."},500);}
});