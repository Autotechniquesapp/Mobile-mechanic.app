import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const cleanPlate=(v:unknown)=>String(v||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12);
const cleanRegion=(v:unknown)=>String(v||"").trim().toUpperCase().replace(/[^A-Z]/g,"").slice(0,2);
const LOOKUP_CENTS=40;

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return json({error:"Sign in required."},401);
    const url=Deno.env.get("SUPABASE_URL")!;
    const publishable=Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}}});
    const service=createClient(url,serviceKey,{auth:{persistSession:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser(auth.slice(7));
    if(userError||!user)return json({error:"Sign in required."},401);

    const body=await req.json().catch(()=>({}));
    const plate=cleanPlate(body.plate),region=cleanRegion(body.region);
    const test=body.test===true;
    if(plate.length<2)return json({error:"Enter a valid plate number."},400);
    if(region.length!==2)return json({error:"Choose the vehicle's state."},400);

    const {data:member,error:memberError}=await service.from("shop_members").select("shop_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
    if(memberError||!member)return json({error:"No active shop membership found."},403);
    const shopId=member.shop_id;

    if(!test){
      const {data:cached}=await service.from("plate_lookup_cache").select("vehicle,expires_at").eq("shop_id",shopId).eq("plate",plate).eq("region",region).gt("expires_at",new Date().toISOString()).maybeSingle();
      if(cached?.vehicle)return json({ok:true,cached:true,charged_cents:0,vehicle:cached.vehicle});

      const {data:account}=await service.from("shop_ai_accounts").select("prepaid_balance_cents").eq("shop_id",shopId).maybeSingle();
      if(Number(account?.prepaid_balance_cents||0)<LOOKUP_CENTS)return json({error:"Not enough prepaid balance. Add at least $0.40 to run this plate lookup.",code:"insufficient_balance"},402);
    }

    const {data:creds,error:credError}=await service.rpc("get_carapi_credentials");
    if(credError||!creds?.api_token||!creds?.api_secret)return json({error:"Plate lookup credentials are not configured."},503);
    const login=await fetch("https://carapi.app/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json","Accept":"text/plain"},body:JSON.stringify({api_token:creds.api_token,api_secret:creds.api_secret})});
    const jwt=(await login.text()).trim().replace(/^"|"$/g,"");
    if(!login.ok||!jwt)return json({error:"Plate provider authentication failed."},502);

    const lookup=new URL("https://carapi.app/api/license-plate");
    lookup.searchParams.set("country_code","US");
    lookup.searchParams.set("region",region);
    lookup.searchParams.set("lookup",test?plate+"#TEST":plate);
    const response=await fetch(lookup,{headers:{Authorization:`Bearer ${jwt}`,Accept:"application/json"}});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.vin)return json({error:data?.message||data?.error||"No vehicle was found for that plate and state."},response.status===404?404:502);

    const vehicle={
      plate,region,vin:String(data.vin||"").toUpperCase(),year:data.year||null,make:data.make||null,model:data.model||null,
      trim:data.trim||data.body||null,body:data.body||null,engine:data.engine_description||null,assembled_in:data.assembled_in||null
    };
    if(test)return json({ok:true,test:true,cached:false,charged_cents:0,vehicle});

    const reference=`plate:${shopId}:${region}:${plate}:${crypto.randomUUID()}`;
    const {data:charge,error:chargeError}=await service.rpc("charge_shop_plate_lookup",{p_shop_id:shopId,p_user_id:user.id,p_reference_id:reference,p_amount_cents:LOOKUP_CENTS,p_metadata:{plate,region,provider:"carapi"}});
    if(chargeError)return json({error:chargeError.message||"Could not charge prepaid balance."},402);

    await service.from("plate_lookup_cache").upsert({shop_id:shopId,plate,region,vehicle,provider:"carapi",provider_cost_cents:LOOKUP_CENTS,charged_cents:LOOKUP_CENTS,expires_at:new Date(Date.now()+30*86400000).toISOString()},{onConflict:"shop_id,plate,region"});
    return json({ok:true,cached:false,charged_cents:LOOKUP_CENTS,balance_cents:charge?.balance_cents,vehicle});
  }catch(err){return json({error:err instanceof Error?err.message:"Plate lookup failed."},500);}
});