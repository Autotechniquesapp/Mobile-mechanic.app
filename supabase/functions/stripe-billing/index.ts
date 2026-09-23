import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const normPlan=(v:string)=>v==="pro"?"pro_fleet":(["solo","shop","pro_fleet"].includes(v)?v:"shop");
const DAY_MS=86400000;
const CARD_FREE_DAYS=30;

function envKey(jsonName:string,legacyName:string){
  try{const parsed=JSON.parse(Deno.env.get(jsonName)||"{}");if(parsed?.default)return parsed.default;}catch{}
  return Deno.env.get(legacyName)||"";
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
    const publishable=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const secret=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(supabaseUrl,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const admin=createClient(supabaseUrl,secret,{auth:{persistSession:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return json({error:"Authentication required."},401);

    const {data:membership}=await admin.from("shop_members").select("shop_id,role,status").eq("user_id",user.id).eq("status","active").in("role",["shop_owner","owner"]).limit(1).maybeSingle();
    if(!membership)return json({error:"Only the shop owner can manage subscription billing."},403);
    const {data:shop,error:shopError}=await admin.from("shops").select("*").eq("shop_id",membership.shop_id).single();
    if(shopError||!shop)return json({error:"Shop not found."},404);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"checkout");
    const requestedPlan=normPlan(String(body.plan||shop.plan||"shop"));
    const returnUrl=String(body.return_url||"https://mobile-mechanic.app/#billing");

    if(shop.comped_permanent||shop.billing_status==="comped"){
      return json({error:"This shop has permanent complimentary access and does not require subscription billing.",code:"PERMANENT_COMP_ACCOUNT"},403);
    }

    if(action==="checkout"&&!shop.stripe_subscription_id&&shop.launch_promo_eligible){
      const startedAt=new Date(shop.trial_started_at).getTime();
      const cardEligibleAt=Number.isFinite(startedAt)?startedAt+CARD_FREE_DAYS*DAY_MS:NaN;
      if(Number.isFinite(cardEligibleAt)&&Date.now()<cardEligibleAt){
        const daysRemaining=Math.max(1,Math.ceil((cardEligibleAt-Date.now())/DAY_MS));
        return json({error:`Your first ${CARD_FREE_DAYS} days are completely free with no card required. Card setup opens after day ${CARD_FREE_DAYS}.`,code:"CARD_NOT_REQUIRED_YET",card_eligible_at:new Date(cardEligibleAt).toISOString(),days_until_card_setup:daysRemaining},403);
      }
    }

    const stripeSecret=Deno.env.get("STRIPE_SECRET_KEY")||"";
    if(!stripeSecret)return json({error:"Stripe is not configured yet. Add STRIPE_SECRET_KEY to Supabase Edge Function secrets."},503);
    const stripeIsLive=/_live_/.test(stripeSecret);
    const priceField=stripeIsLive?"stripe_live_price_id":"stripe_test_price_id";
    const stripeMode=stripeIsLive?"live":"test";
    const stripe=new Stripe(stripeSecret);

    let customerId=shop.stripe_customer_id as string|null;
    if(customerId){
      try{await stripe.customers.retrieve(customerId);}catch{customerId=null;}
    }
    if(!customerId){
      const customer=await stripe.customers.create({email:user.email||undefined,name:shop.name,metadata:{shop_id:shop.shop_id,platform:"mobile_mechanic_ai",mode:stripeMode}});
      customerId=customer.id;
      await admin.from("shops").update({stripe_customer_id:customerId,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
    }

    async function validPrice(id:any){if(!id)return null;try{const p=await stripe.prices.retrieve(String(id));return p?.active?String(id):null;}catch{return null;}}
    async function ensurePlanPrice(code:string){
      const {data:row,error}=await admin.from("plan_catalog").select("code,name,monthly_price,stripe_price_id,stripe_test_price_id,stripe_live_price_id,active").eq("code",code).eq("active",true).single();
      if(error||!row)throw new Error("Selected plan is unavailable.");
      const existing=await validPrice((row as any)[priceField]);if(existing)return existing;
      const product=await stripe.products.create({name:`Mobile Mechanic AI — ${row.name}`,metadata:{catalog_type:"plan",catalog_code:row.code,platform:"mobile_mechanic_ai"}});
      const price=await stripe.prices.create({currency:"usd",unit_amount:Math.round(Number(row.monthly_price)*100),recurring:{interval:"month"},product:product.id,metadata:{catalog_type:"plan",catalog_code:row.code,platform:"mobile_mechanic_ai"}});
      await admin.from("plan_catalog").update({[priceField]:price.id,stripe_price_id:price.id,updated_at:new Date().toISOString()}).eq("code",row.code);
      return price.id;
    }
    async function ensureAddonPrice(row:any){
      const existing=await validPrice(row?.[priceField]);if(existing)return existing;
      const product=await stripe.products.create({name:`Mobile Mechanic AI — ${row.name}`,metadata:{catalog_type:"addon",catalog_code:row.code,platform:"mobile_mechanic_ai"}});
      const price=await stripe.prices.create({currency:"usd",unit_amount:Math.round(Number(row.monthly_price)*100),recurring:{interval:"month"},product:product.id,metadata:{catalog_type:"addon",catalog_code:row.code,platform:"mobile_mechanic_ai"}});
      await admin.from("addon_catalog").update({[priceField]:price.id,stripe_price_id:price.id,updated_at:new Date().toISOString()}).eq("code",row.code);
      return price.id;
    }
    async function desiredItems(planCode:string){
      const planPrice=await ensurePlanPrice(planCode);
      const {data:activeAddons}=await admin.from("shop_addons").select("addon_code,status").eq("shop_id",shop.shop_id).eq("status","active");
      const codes=(activeAddons||[]).map((x:any)=>x.addon_code);
      let addons:any[]=[];
      if(codes.length){const {data}=await admin.from("addon_catalog").select("code,name,monthly_price,stripe_price_id,stripe_test_price_id,stripe_live_price_id,active,available_on_plans").in("code",codes).eq("active",true);addons=(data||[]).filter((a:any)=>(a.available_on_plans||[]).includes(planCode));}
      const addonPrices:{code:string,price:string}[]=[];
      for(const a of addons)addonPrices.push({code:a.code,price:await ensureAddonPrice(a)});
      return {planPrice,addonPrices};
    }
    async function currentCatalogIds(){
      const [{data:allPlans},{data:allAddons}]=await Promise.all([
        admin.from("plan_catalog").select(`code,${priceField}`).not(priceField,"is",null),
        admin.from("addon_catalog").select(`code,${priceField}`).not(priceField,"is",null)
      ]);
      return {planPriceIds:new Set((allPlans||[]).map((x:any)=>x[priceField]).filter(Boolean)),addonByPrice:new Map((allAddons||[]).map((x:any)=>[x[priceField],x.code]).filter((x:any)=>x[0]))};
    }
    async function syncExisting(planCode:string){
      let sub:any;try{sub=await stripe.subscriptions.retrieve(shop.stripe_subscription_id,{expand:["items.data.price"]});}catch{return null;}
      const {planPrice,addonPrices}=await desiredItems(planCode);
      const {planPriceIds,addonByPrice}=await currentCatalogIds();
      const wantedAddons=new Map(addonPrices.map(x=>[x.price,x.code]));
      const changes:any[]=[];let hasPlan=false;const currentAddonPrices=new Set<string>();
      for(const item of sub.items.data){const pid=typeof item.price==="string"?item.price:item.price.id;if(planPriceIds.has(pid)){hasPlan=true;if(pid!==planPrice)changes.push({id:item.id,price:planPrice,quantity:1});continue;}if(addonByPrice.has(pid)){currentAddonPrices.add(pid);if(!wantedAddons.has(pid))changes.push({id:item.id,deleted:true});}}
      if(!hasPlan)changes.push({price:planPrice,quantity:1});for(const a of addonPrices)if(!currentAddonPrices.has(a.price))changes.push({price:a.price,quantity:1});
      const updated=changes.length?await stripe.subscriptions.update(sub.id,{items:changes,metadata:{shop_id:shop.shop_id,plan:planCode,mode:stripeMode},proration_behavior:"create_prorations"}):sub;
      const period=(updated as any).current_period_end ?? (updated as any).items?.data?.[0]?.current_period_end;
      await admin.from("shops").update({plan:planCode,stripe_subscription_status:updated.status,billing_status:updated.status==="active"?"active":updated.status,stripe_current_period_end:period?new Date(period*1000).toISOString():null,stripe_cancel_at_period_end:Boolean(updated.cancel_at_period_end),billing_last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
      return updated;
    }

    if(action==="portal"){
      const portal=await stripe.billingPortal.sessions.create({customer:customerId,return_url:returnUrl});
      return json({url:portal.url,kind:"portal",mode:stripeMode});
    }
    if(action==="sync"){
      if(!shop.stripe_subscription_id)return json({error:"No Stripe subscription exists yet."},409);
      const updated=await syncExisting(requestedPlan);if(!updated)return json({error:`The saved subscription belongs to a different Stripe ${stripeMode==='live'?'test':'live'} environment. Start a ${stripeMode} checkout instead.`,code:"STRIPE_ENVIRONMENT_MISMATCH"},409);
      return json({kind:"updated",status:updated.status,mode:stripeMode});
    }
    if(action!=="checkout")return json({error:"Unknown billing action."},400);

    if(shop.stripe_subscription_id){
      const updated=await syncExisting(requestedPlan);if(updated)return json({kind:"updated",status:updated.status,mode:stripeMode});
      await admin.from("shops").update({stripe_subscription_id:null,stripe_subscription_status:null,stripe_checkout_session_id:null,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
    }

    const {planPrice,addonPrices}=await desiredItems(requestedPlan);
    const line_items=[{price:planPrice,quantity:1},...addonPrices.map(x=>({price:x.price,quantity:1}))];
    const subscription_data:any={metadata:{shop_id:shop.shop_id,plan:requestedPlan,mode:stripeMode}};
    if(shop.launch_promo_eligible){
      const trialEnd=Math.floor(new Date(shop.trial_expires_at).getTime()/1000);
      const now=Math.floor(Date.now()/1000);
      if(Number.isFinite(trialEnd)&&trialEnd>now+48*3600)subscription_data.trial_end=trialEnd;
    }
    const session=await stripe.checkout.sessions.create({mode:"subscription",customer:customerId,line_items,success_url:returnUrl,cancel_url:returnUrl,client_reference_id:shop.shop_id,metadata:{shop_id:shop.shop_id,plan:requestedPlan,mode:stripeMode,launch_promo:shop.launch_promo_eligible?"true":"false"},subscription_data,allow_promotion_codes:true});
    await admin.from("shops").update({plan:requestedPlan,stripe_checkout_session_id:session.id,billing_last_error:null,updated_at:new Date().toISOString()}).eq("shop_id",shop.shop_id);
    return json({url:session.url,kind:"checkout",mode:stripeMode,launch_promo_eligible:Boolean(shop.launch_promo_eligible)});
  }catch(err){console.error(err);return json({error:err instanceof Error?err.message:"Stripe billing failed."},500);}
});