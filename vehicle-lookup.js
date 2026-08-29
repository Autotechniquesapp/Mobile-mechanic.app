(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
let busy=false;
const modelCache=new Map();
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

async function loadModels(form,{preserve=true}={}){
  if(!sb||!form)return;
  const year=String(form.querySelector('[name="year"]')?.value||'').trim();
  const make=String(form.querySelector('[name="make"]')?.value||'').trim();
  const model=ensureModelSelect(form);
  if(!model)return;
  const previous=preserve?String(model.value||'').trim():'';
  if(!/^\d{4}$/.test(year)||!make){
    model.innerHTML='<option value="">Select year and make first…</option>';
    return;
  }
  const key=`${year}|${make.toLowerCase()}`;
  model.disabled=true;
  model.innerHTML='<option value="">Loading models…</option>';
  try{
    let models=modelCache.get(key);
    if(!models){
      const {data,error}=await sb.functions.invoke('vehicle-data',{body:{action:'models_for_make_year',model_year:year,make}});
      if(error)throw new Error(error.message||'Model lookup failed.');
      if(data?.error)throw new Error(data.error);
      models=Array.isArray(data?.models)?data.models:[];
      modelCache.set(key,models);
    }
    model.innerHTML='<option value="">Select model…</option>';
    models.forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;model.appendChild(o);});
    if(previous){
      let opt=[...model.options].find(o=>o.value.toLowerCase()===previous.toLowerCase());
      if(!opt){opt=document.createElement('option');opt.value=previous;opt.textContent=previous;model.appendChild(opt);}
      model.value=opt.value;
    }
    if(!models.length)model.innerHTML='<option value="">No models found — decode VIN or enter later</option>';
  }catch(err){
    model.innerHTML='<option value="">Could not load models — decode VIN or retry</option>';
    console.warn('Vehicle model lookup failed',err);
  }finally{model.disabled=false;}
}

async function decode(btn){if(busy||!sb)return;const form=btn.closest('form')||document;const vin=form.querySelector('[name="vin"]');if(!vin)return;const value=String(vin.value||'').trim().toUpperCase();if(value.length<8){toast('Enter a VIN first.','bad');return;}busy=true;btn.disabled=true;const old=btn.textContent;btn.textContent='Decoding…';try{
 const year=form.querySelector('[name="year"]')?.value||'';
 const {data,error}=await sb.functions.invoke('vehicle-data',{body:{action:'decode_vin',vin:value,model_year:year}});
 if(error)throw new Error(error.message||'VIN lookup failed.');if(data?.error)throw new Error(data.error);
 const v=data.vehicle||{};vin.value=v.vin||value;
 setValue(form,'year',v.year);setValue(form,'make',v.make);
 await loadModels(form,{preserve:false});
 setValue(form,'model',v.model);setValue(form,'trim',v.trim);
 const engine=[v.engine_displacement_l?`${v.engine_displacement_l}L`:null,v.engine_cylinders?`${v.engine_cylinders} cyl`:null,v.engine_model||null].filter(Boolean).join(' ');
 if(engine)setValue(form,'engine',engine);if(v.drive_type)setValue(form,'drive',v.drive_type);
 toast(`${v.year||''} ${v.make||''} ${v.model||''}`.trim()||'VIN decoded.','good');
}catch(err){toast(err.message||'VIN lookup failed.','bad');}finally{busy=false;btn.disabled=false;btn.textContent=old;}}

function enhance(){
  document.querySelectorAll('form').forEach(form=>{
    const model=form.querySelector('[name="model"]');
    if(model&&!model.dataset.nhtsaModelSelect){
      ensureModelSelect(form);
      const year=form.querySelector('[name="year"]')?.value;
      const make=form.querySelector('[name="make"]')?.value;
      if(year&&make)setTimeout(()=>loadModels(form),0);
    }
  });
  document.querySelectorAll('input[name="vin"]').forEach(vin=>{if(vin.dataset.nhtsaLookup==='1')return;vin.dataset.nhtsaLookup='1';const wrap=document.createElement('div');wrap.className='vin-lookup-actions';wrap.style.marginTop='8px';wrap.innerHTML='<button type="button" class="btn btn-soft" data-decode-vin>Decode VIN</button><span class="small muted" style="margin-left:8px">NHTSA vehicle data</span>';vin.insertAdjacentElement('afterend',wrap);});
}

document.addEventListener('change',e=>{
  const el=e.target;
  if(!el?.matches?.('[name="year"],[name="make"]'))return;
  const form=el.closest('form');
  if(form?.querySelector('[name="model"]'))loadModels(form,{preserve:false});
},true);
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-decode-vin]');if(b){e.preventDefault();decode(b);}},true);
new MutationObserver(()=>enhance()).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(enhance,500);
})();