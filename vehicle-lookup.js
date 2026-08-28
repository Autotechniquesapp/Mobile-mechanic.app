(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
let busy=false;
function toast(msg,type=''){document.querySelector('.vin-toast')?.remove();const d=document.createElement('div');d.className=`toast vin-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),4500);}
function setValue(form,name,value){if(value==null||value==='')return;const el=form.querySelector(`[name="${name}"]`);if(!el)return;const val=String(value);if(el.tagName==='SELECT'){
  let opt=[...el.options].find(o=>String(o.value).toLowerCase()===val.toLowerCase()||String(o.textContent).toLowerCase()===val.toLowerCase());
  if(!opt&&name==='drive')opt=[...el.options].find(o=>val.toLowerCase().includes(String(o.value).toLowerCase())||val.toLowerCase().includes(String(o.textContent).toLowerCase()));
  if(opt)el.value=opt.value;
}else el.value=val;
el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
async function decode(btn){if(busy||!sb)return;const form=btn.closest('form')||document;const vin=form.querySelector('[name="vin"]');if(!vin)return;const value=String(vin.value||'').trim().toUpperCase();if(value.length<8){toast('Enter a VIN first.','bad');return;}busy=true;btn.disabled=true;const old=btn.textContent;btn.textContent='Decoding…';try{
 const year=form.querySelector('[name="year"]')?.value||'';
 const {data,error}=await sb.functions.invoke('vehicle-data',{body:{action:'decode_vin',vin:value,model_year:year}});
 if(error)throw new Error(error.message||'VIN lookup failed.');if(data?.error)throw new Error(data.error);
 const v=data.vehicle||{};vin.value=v.vin||value;
 setValue(form,'year',v.year);setValue(form,'make',v.make);setValue(form,'model',v.model);setValue(form,'trim',v.trim);
 const engine=[v.engine_displacement_l?`${v.engine_displacement_l}L`:null,v.engine_cylinders?`${v.engine_cylinders} cyl`:null,v.engine_model||null].filter(Boolean).join(' ');
 if(engine)setValue(form,'engine',engine);if(v.drive_type)setValue(form,'drive',v.drive_type);
 toast(`${v.year||''} ${v.make||''} ${v.model||''}`.trim()||'VIN decoded.','good');
}catch(err){toast(err.message||'VIN lookup failed.','bad');}finally{busy=false;btn.disabled=false;btn.textContent=old;}}
function enhance(){document.querySelectorAll('input[name="vin"]').forEach(vin=>{if(vin.dataset.nhtsaLookup==='1')return;vin.dataset.nhtsaLookup='1';const wrap=document.createElement('div');wrap.className='vin-lookup-actions';wrap.style.marginTop='8px';wrap.innerHTML='<button type="button" class="btn btn-soft" data-decode-vin>Decode VIN</button><span class="small muted" style="margin-left:8px">NHTSA vehicle data</span>';vin.insertAdjacentElement('afterend',wrap);});}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-decode-vin]');if(b){e.preventDefault();decode(b);}},true);
new MutationObserver(()=>enhance()).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(enhance,500);
})();