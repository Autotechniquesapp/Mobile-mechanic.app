(() => {
'use strict';
const categories=[['procedures','Procedures'],['specifications','Specifications'],['parts-labor','Parts & Labor'],['figures','Figures'],['wiring','Wiring Diagrams'],['tsbs','TSB / Bulletins'],['quick','Quick Service'],['recalls','Recalls']];
const providers=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function vehicleOf(ctx){return ctx.job?.vehicle||{};}
function label(v){return [v.year,v.make,v.model,v.trim].filter(Boolean).join(' ')||'Select or open a vehicle';}
function slug(v){return String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function officialUrl(v){return `https://www.nhtsa.gov/vehicle/${encodeURIComponent(v.year||'')}/${encodeURIComponent(v.make||'')}/${encodeURIComponent(v.model||'')}`;}
function manufacturerSource(v){
  const make=String(v.make||'').toLowerCase(),model=slug(v.model),year=encodeURIComponent(v.year||'');
  if(make==='ford'||make==='lincoln')return {name:'Ford / Lincoln Owner Support',url:`https://www.ford.com/support/vehicle/${model}/${year}/owner-manuals/`};
  if(make==='toyota'||make==='scion')return {name:'Toyota Manuals & Warranties',url:`https://www.toyota.com/owners/warranty-owners-manuals/vehicle/${model}/${year}/`};
  if(make==='cadillac')return {name:'Cadillac Manuals & Guides',url:'https://www.cadillac.com/support/vehicle/manuals-guides'};
  if(['chevrolet','chevy'].includes(make))return {name:'Chevrolet Manuals & Guides',url:'https://www.chevrolet.com/support/vehicle/manuals-guides'};
  if(make==='gmc')return {name:'GMC Manuals & Guides',url:'https://www.gmc.com/support/vehicle/manuals-guides'};
  if(make==='buick')return {name:'Buick Manuals & Guides',url:'https://www.buick.com/support/vehicle/manuals-guides'};
  if(['honda','acura'].includes(make))return {name:'Honda / Acura Owner Manuals',url:'https://owners.honda.com/'};
  if(['nissan','infiniti'].includes(make))return {name:'Nissan / Infiniti Manuals & Guides',url:'https://www.nissanusa.com/owners/manuals-guides.html'};
  return {name:`${v.make||'Manufacturer'} official support`,url:`https://www.nhtsa.gov/vehicle/${year}/${encodeURIComponent(v.make||'')}/${encodeURIComponent(v.model||'')}`};
}
async function nhtsa(v,query,category){
  if(!v.year||!v.make||!v.model)return [];
  const base='https://api.nhtsa.gov';
  const params=`make=${encodeURIComponent(v.make)}&model=${encodeURIComponent(v.model)}&modelYear=${encodeURIComponent(v.year)}`;
  const urls=[];
  if(category==='recalls'||category==='tsbs')urls.push(['Recall',`${base}/recalls/recallsByVehicle?${params}`]);
  if(category==='tsbs'||category==='procedures')urls.push(['Safety complaint',`${base}/complaints/complaintsByVehicle?${params}`]);
  const out=[];
  for(const [kind,url] of urls){
    try{const r=await fetch(url);if(!r.ok)continue;const data=await r.json();for(const x of (data.results||data.Results||[])){
      const title=x.Component||x.components||x.Summary||x.summary||kind;
      const body=x.Summary||x.summary||x.Consequence||x.consequence||x.FAILURE_DESC||x.failureDescription||'';
      const hay=`${title} ${body}`.toLowerCase();if(query&& !hay.includes(query.toLowerCase()))continue;
      out.push({title:`${kind}: ${title}`,body,source:'Official NHTSA data'});
    }}catch{}
  }
  return out.slice(0,30);
}
function providerCard(category){
  const name=categories.find(x=>x[0]===category)?.[1]||'Service information';
  return `<article class="service-result service-provider"><h4>${esc(name)} provider ready</h4><p>Real ${esc(name.toLowerCase())} requires an authorized service-information source. The screen and adapter are ready to connect without exposing provider credentials in the browser.</p><small>No copied or generated repair data is shown.</small></article>`;
}
async function search(state){
  const out=state.root.querySelector('[data-service-results]'),v=vehicleOf(state.ctx),q=state.root.querySelector('[data-service-query]').value.trim();
  out.innerHTML='<div class="service-empty">Searching official sources…</div>';
  let results=[];
  const adapter=providers.get(state.category);if(adapter)results=await adapter.search({vehicle:v,query:q,category:state.category});
  else results=await nhtsa(v,q,state.category);
  const source=manufacturerSource(v),providerNeeded=['parts-labor','figures','wiring'].includes(state.category);
  out.innerHTML=(results.map(x=>`<article class="service-result"><h4>${esc(x.title)}</h4><p>${esc(x.body||'Open the official record for details.')}</p><small>${esc(x.source||'Connected provider')}</small></article>`).join('')||'')+`<article class="service-result"><h4>${esc(source.name)}</h4><p>Search the manufacturer’s free manuals, maintenance guides, quick-reference information, and vehicle support for “${esc(q||state.category)}.” Coverage varies by year and model.</p><a class="service-link" href="${esc(source.url)}" target="_blank" rel="noopener">Open official manufacturer source</a></article><article class="service-result"><h4>NHTSA bulletins, recalls, and safety records</h4><p>Open the official vehicle record for manufacturer communications, recalls, complaints, and investigations.</p><a class="service-link" href="${esc(officialUrl(v))}" target="_blank" rel="noopener">Open NHTSA vehicle record</a></article>`+(providerNeeded?providerCard(state.category):'');
}
function render(root,ctx){
  if(!root)return;const v=vehicleOf(ctx),state={root,ctx,category:'procedures'};
  root.innerHTML=`<section class="service-info"><div class="service-info-head"><div class="service-vehicle"><div><h3>${esc(label(v))}</h3><p>${esc(v.engine||'Engine not entered')} ${v.vin?`• VIN ${esc(v.vin)}`:''}</p></div><span class="service-source">Official + provider-ready</span></div><div class="service-search"><input data-service-query aria-label="Search service information" placeholder="Search cabin air filter, U-joint, oil reset…"><button class="btn btn-primary" data-service-search aria-label="Search">⌕</button></div></div><div class="service-tabs">${categories.map(([id,n],i)=>`<button class="service-tab ${i===0?'active':''}" data-service-category="${id}">${esc(n)}</button>`).join('')}</div><div class="service-results" data-service-results><div class="service-empty">Choose a category and search this vehicle.</div></div></section>`;
  root.querySelectorAll('[data-service-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.serviceCategory;root.querySelectorAll('[data-service-category]').forEach(x=>x.classList.toggle('active',x===b));search(state);});
  root.querySelector('[data-service-search]').onclick=()=>search(state);
  root.querySelector('[data-service-query]').addEventListener('keydown',e=>{if(e.key==='Enter')search(state);});
}
window.MobileMechanicServiceInformation={render,registerProvider:(category,adapter)=>providers.set(category,adapter)};
})();
