(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
let busy=false;
const modelCache=new Map();
let makePromise=null;
let makePickerId=0;
const DBKEY='mobile_mechanic_ai_approved_v7';
const STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
function isShopSession(){try{const d=JSON.parse(localStorage.getItem(DBKEY)||'{}');return d.session?.role==='shop'&&!!d.session?.shopId;}catch{return false;}}
function toast(msg,type=''){document.querySelector('.vin-toast')?.remove();const d=document.createElement('div');d.className=`toast vin-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),4500);}
function setValue(form,name,value){if(value==null||value==='')return;const el=form.querySelector(`[name="${name}"]`);if(!el)return;const val=String(value);if(el.tagName==='SELECT'){
  let opt=[...el.options].find(o=>String(o.value).toLowerCase()===val.toLowerCase()||String(o.textContent).toLowerCase()===val.toLowerCase());
  if(!opt&&name==='drive')opt=[...el.options].find(o=>val.toLowerCase().includes(String(o.value).toLowerCase())||val.toLowerCase().includes(String(o.textContent).toLowerCase()));
  if(!opt&&name==='model'){
    opt=document.createElement('option');opt.value=val;opt.textContent=val;el.appendChild(opt);
  }
  if(opt)el.value=opt.value;
}else el.value=val;
el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}

async function nhtsaJson(path){
  const r=await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/${path}${path.includes('?')?'&':'?'}format=json`,{cache:'force-cache'});
  if(!r.ok)throw new Error(`NHTSA lookup failed (${r.status})`);
  return r.json();
}

async function allAutomotiveMakes(){
  if(makePromise)return makePromise;
  makePromise=(async()=>{
    const types=['car','truck','multipurpose passenger vehicle (mpv)'];
    const names=new Set();
    const results=await Promise.allSettled(types.map(t=>nhtsaJson(`GetMakesForVehicleType/${encodeURIComponent(t)}`)));
    results.forEach(result=>{
      if(result.status!=='fulfilled')return;
      (result.value?.Results||[]).forEach(row=>{
        const name=String(row.MakeName||row.Make_Name||'').trim();
        if(name)names.add(name);
      });
    });
    if(!names.size){
      const fallback=await nhtsaJson('GetAllMakes');
      (fallback?.Results||[]).forEach(row=>{const name=String(row.Make_Name||row.MakeName||'').trim();if(name)names.add(name);});
    }
    return [...names].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  })().catch(err=>{makePromise=null;throw err;});
  return makePromise;
}

function ensureMakePicker(form){
  const current=form.querySelector('[name="make"]');
  if(!current||current.dataset.fullMakePicker==='1')return current;
  const existing=String(current.value||'').trim();
  let input=current;
  if(current.tagName!=='INPUT'){
    input=document.createElement('input');
    for(const attr of [...current.attributes]){
      if(['type','value','list'].includes(attr.name))continue;
      try{input.setAttribute(attr.name,attr.value);}catch{}
    }
    input.name='make';
    input.value=existing;
    input.autocomplete='off';
    current.replaceWith(input);
  }
  input.dataset.fullMakePicker='1';
  input.placeholder='Start typing any make';
  const list=document.createElement('datalist');
  list.id=`mma-all-vehicle-makes-${++makePickerId}`;
  input.setAttribute('list',list.id);
  input.insertAdjacentElement('afterend',list);
  const hint=document.createElement('div');
  hint.className='small muted';
  hint.dataset.makePickerHint='1';
  hint.style.marginTop='5px';
  hint.textContent='Full automotive make list. You can also type a make manually.';
  list.insertAdjacentElement('afterend',hint);
  allAutomotiveMakes().then(names=>{
    if(!list.isConnected)return;
    const frag=document.createDocumentFragment();
    names.forEach(name=>{const o=document.createElement('option');o.value=name;frag.appendChild(o);});
    list.replaceChildren(frag);
  }).catch(err=>{console.warn('Full make list unavailable; manual make entry remains enabled.',err);hint.textContent='Type the vehicle make manually.';});
  return input;
}

function ensureModelSelect(form){
  const current=form.querySelector('[name="model"]');
  if(!current)return null;
  if(current.tagName==='SELECT'){
    current.dataset.nhtsaModelSelect='1';
    return current;
  }
  const select=document.createElement('select');
  for(const attr of [...current.attributes]){
    if(attr.name==='type'||attr.name==='placeholder'||attr.name==='value')continue;
    try{select.setAttribute(attr.name,attr.value);}catch{}
  }
  select.name='model';
  select.dataset.nhtsaModelSelect='1';
  const existing=String(current.value||'').trim();
  select.innerHTML='<option value="">Select model…</option>'+(existing?`<option value="${existing.replace(/"/g,'&quot;')}" selected>${existing.replace(/</g,'&lt;')}</option>`:'');
  current.replaceWith(select);
  return select;
}

async function modelsForMakeYear(year,make){
  const key=`${year}|${make.toLowerCase()}`;
  if(modelCache.has(key))return modelCache.get(key);
  let models=[];
  try{
    const js=await nhtsaJson(`GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${encodeURIComponent(year)}`);
    models=[...new Set((js?.Results||[]).map(row=>String(row.Model_Name||row.ModelName||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  }catch(nhtsaErr){
    if(!sb)throw nhtsaErr;
    const {data,error}=await sb.functions.invoke('vehicle-data',{body:{action:'models_for_make_year',model_year:year,make}});
    if(error)throw new Error(error.message||'Model lookup failed.');
    if(data?.error)throw new Error(data.error);
    models=Array.isArray(data?.models)?data.models:[];
  }
  modelCache.set(key,models);
  return models;
}

async function loadModels(form,{preserve=true}={}){
  if(!form)return;
  const year=String(form.querySelector('[name="year"]')?.value||'').trim();
  const make=String(form.querySelector('[name="make"]')?.value||'').trim();
  const model=ensureModelSelect(form);
  if(!model)return;
  const previous=preserve?String(model.value||'').trim():'';
  if(!/^\d{4}$/.test(year)||!make){
    model.innerHTML='<option value="">Select year and make first…</option>';
    return;
  }
  model.disabled=true;
  model.innerHTML='<option value="">Loading models…</option>';
  try{
    const models=await modelsForMakeYear(year,make);
    model.innerHTML='<option value="">Select model…</option>';
    models.forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;model.appendChild(o);});
    if(previous){
      let opt=[...model.options].find(o=>o.value.toLowerCase()===previous.toLowerCase());
      if(!opt){opt=document.createElement('option');opt.value=previous;opt.textContent=previous;model.appendChild(opt);}
      model.value=opt.value;
    }
    if(!models.length){
      model.innerHTML='<option value="">Model not listed — use VIN or enter manually</option>';
      const manual=document.createElement('option');manual.value='Other / Manual';manual.textContent='Other / Manual';model.appendChild(manual);
    }
  }catch(err){
    model.innerHTML='<option value="">Could not load models — use VIN or retry</option>';
    const manual=document.createElement('option');manual.value='Other / Manual';manual.textContent='Other / Manual';model.appendChild(manual);
    console.warn('Vehicle model lookup failed',err);
  }finally{model.disabled=false;}
}

async function directVinDecode(value,modelYear=''){
  const js=await nhtsaJson(`DecodeVinValuesExtended/${encodeURIComponent(value)}${modelYear?`?modelyear=${encodeURIComponent(modelYear)}`:''}`);
  const row=js?.Results?.[0]||{};
  return {
    vin:value,
    year:row.ModelYear||modelYear||'',
    make:row.Make||'',
    model:row.Model||'',
    trim:row.Trim||'',
    engine_displacement_l:row.DisplacementL||'',
    engine_cylinders:row.EngineCylinders||'',
    engine_model:row.EngineModel||'',
    drive_type:row.DriveType||''
  };
}

async function decode(btn){
  if(busy)return;
  const form=btn.closest('form')||document;const vin=form.querySelector('[name="vin"]');if(!vin)return;
  const value=String(vin.value||'').trim().toUpperCase();if(value.length<8){toast('Enter a VIN first.','bad');return;}
  busy=true;btn.disabled=true;const old=btn.textContent;btn.textContent='Decoding…';
  try{
    const year=form.querySelector('[name="year"]')?.value||'';
    let v=null;
    if(sb){
      try{
        const {data,error}=await sb.functions.invoke('vehicle-data',{body:{action:'decode_vin',vin:value,model_year:year}});
        if(error)throw error;if(data?.error)throw new Error(data.error);v=data?.vehicle||null;
      }catch(err){console.warn('Edge VIN decoder unavailable; using NHTSA directly.',err);}
    }
    if(!v)v=await directVinDecode(value,year);
    vin.value=v.vin||value;
    setValue(form,'year',v.year);setValue(form,'make',v.make);
    await loadModels(form,{preserve:false});
    setValue(form,'model',v.model);setValue(form,'trim',v.trim);
    const engine=[v.engine_displacement_l?`${v.engine_displacement_l}L`:null,v.engine_cylinders?`${v.engine_cylinders} cyl`:null,v.engine_model||null].filter(Boolean).join(' ');
    if(engine)setValue(form,'engine',engine);if(v.drive_type)setValue(form,'drive',v.drive_type);
    toast(`${v.year||''} ${v.make||''} ${v.model||''}`.trim()||'VIN decoded.','good');
  }catch(err){toast(err.message||'VIN lookup failed.','bad');}
  finally{busy=false;btn.disabled=false;btn.textContent=old;}
}

async function lookupPlate(btn){
  if(busy||!sb)return;
  const form=btn.closest('form')||document,plate=form.querySelector('[name="plate"]'),region=form.querySelector('[name="plateRegion"]');
  const value=String(plate?.value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''),state=String(region?.value||'').trim().toUpperCase();
  if(value.length<2){toast('Enter a plate number first.','bad');return;}
  if(state.length!==2){toast("Choose the plate's state.",'bad');return;}
  busy=true;btn.disabled=true;const old=btn.textContent;btn.textContent='Looking up…';
  try{
    const {data,error}=await sb.functions.invoke('plate-lookup',{body:{plate:value,region:state}});
    if(error)throw new Error(error.message||'Plate lookup failed.');if(data?.error)throw new Error(data.error);
    const v=data.vehicle||{};setValue(form,'plate',v.plate||value);setValue(form,'vin',v.vin);setValue(form,'year',v.year);setValue(form,'make',v.make);
    await loadModels(form,{preserve:false});setValue(form,'model',v.model);setValue(form,'trim',v.trim);setValue(form,'engine',v.engine);
    const charge=Number(data.charged_cents||0),note=data.cached?'Saved lookup — no additional charge.':`Vehicle found • ${(charge/100).toFixed(2)} deducted from this shop.`;
    toast(note,'good');
  }catch(err){toast(err.message||'Plate lookup failed.','bad');}
  finally{busy=false;btn.disabled=false;btn.textContent=old;}
}

function enhance(){
  document.querySelectorAll('form').forEach(form=>{
    const make=form.querySelector('[name="make"]');
    if(make&&!make.dataset.fullMakePicker)ensureMakePicker(form);
    const model=form.querySelector('[name="model"]');
    if(model&&!model.dataset.nhtsaModelSelect){
      ensureModelSelect(form);
      const year=form.querySelector('[name="year"]')?.value;
      const currentMake=form.querySelector('[name="make"]')?.value;
      if(year&&currentMake)setTimeout(()=>loadModels(form),0);
    }
  });
  document.querySelectorAll('input[name="vin"]').forEach(vin=>{if(vin.dataset.nhtsaLookup==='1')return;vin.dataset.nhtsaLookup='1';const wrap=document.createElement('div');wrap.className='vin-lookup-actions';wrap.style.marginTop='8px';wrap.innerHTML='<button type="button" class="btn btn-soft" data-decode-vin>Decode VIN</button><span class="small muted" style="margin-left:8px">NHTSA vehicle data</span>';vin.insertAdjacentElement('afterend',wrap);});
  if(isShopSession())document.querySelectorAll('input[name="plate"]').forEach(plate=>{if(plate.dataset.plateLookup==='1')return;plate.dataset.plateLookup='1';const wrap=document.createElement('div');wrap.className='plate-lookup-actions';wrap.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px';const options=STATES.map(s=>`<option value="${s}">${s}</option>`).join('');wrap.innerHTML=`<select name="plateRegion" aria-label="Plate state" style="width:90px;background:#080c10;color:#f5f6f8;border:1px solid #303945;border-radius:8px;padding:9px 10px"><option value="">State</option>${options}</select><button type="button" class="btn btn-soft" data-lookup-plate>Look Up Plate</button><span class="small muted">$0.40 from this shop's prepaid balance</span>`;plate.insertAdjacentElement('afterend',wrap);});
}

document.addEventListener('change',e=>{
  const el=e.target;
  if(!el?.matches?.('[name="year"],[name="make"]'))return;
  const form=el.closest('form');
  if(form?.querySelector('[name="model"]'))loadModels(form,{preserve:false});
},true);
document.addEventListener('blur',e=>{
  const el=e.target;
  if(!el?.matches?.('[name="make"]'))return;
  const form=el.closest('form');
  if(form?.querySelector('[name="year"]')?.value&&form?.querySelector('[name="model"]'))loadModels(form,{preserve:false});
},true);
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-decode-vin],[data-lookup-plate]');if(!b)return;e.preventDefault();if(b.matches('[data-lookup-plate]'))lookupPlate(b);else decode(b);},true);
new MutationObserver(()=>enhance()).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(enhance,350);
})();
