const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const cleanVin=(v:unknown)=>String(v||"").trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9*]/g,"");
const cleanText=(v:unknown)=>String(v||"").trim().replace(/[^A-Za-z0-9 .&'()\-_/]/g,"").slice(0,80);
const cleanYear=(v:unknown)=>String(v||"").replace(/[^0-9]/g,"").slice(0,4);
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"decode_vin");

    if(action==="models_for_make_year"){
      const make=cleanText(body.make);
      const year=cleanYear(body.model_year||body.year);
      if(!make||year.length!==4)return json({error:"Choose a valid year and make first."},400);
      const url=new URL(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${encodeURIComponent(year)}`);
      url.searchParams.set("format","json");
      const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"MobileMechanicAI/1.0"}});
      const d=await r.json().catch(()=>null);
      if(!r.ok||!Array.isArray(d?.Results))return json({error:"Vehicle model service did not return data."},502);
      const models=[...new Set(d.Results.map((x:any)=>String(x?.Model_Name||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
      return json({ok:true,source:"NHTSA vPIC",year,make,models});
    }

    if(action!=="decode_vin")return json({error:"Unknown action."},400);
    const vin=cleanVin(body.vin);
    if(vin.length<8||vin.length>17)return json({error:"Enter a valid VIN."},400);
    const year=cleanYear(body.model_year);
    const url=new URL(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}`);
    url.searchParams.set("format","json");
    if(year)url.searchParams.set("modelyear",year);
    const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"MobileMechanicAI/1.0"}});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.Results?.[0])return json({error:"VIN service did not return vehicle data."},502);
    const x=d.Results[0];
    const errors=String(x.ErrorText||"").split(";").map((s:string)=>s.trim()).filter((s:string)=>s&&!/^0\s*-/.test(s));
    const result={
      vin,
      year:x.ModelYear||year||null,
      make:x.Make||null,
      model:x.Model||null,
      trim:x.Trim||x.Series||null,
      body_class:x.BodyClass||null,
      vehicle_type:x.VehicleType||null,
      manufacturer:x.Manufacturer||null,
      engine_cylinders:x.EngineCylinders||null,
      engine_displacement_l:x.DisplacementL||null,
      engine_model:x.EngineModel||null,
      fuel_type:x.FuelTypePrimary||null,
      drive_type:x.DriveType||null,
      transmission:x.TransmissionStyle||null,
      doors:x.Doors||null,
      plant_country:x.PlantCountry||null,
      error_code:x.ErrorCode||null,
      warnings:errors
    };
    return json({ok:true,source:"NHTSA vPIC",vehicle:result});
  }catch(err){return json({error:err instanceof Error?err.message:"Vehicle lookup failed."},500);}
});