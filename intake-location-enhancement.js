(() => {
'use strict';
if(window.__MMAIntakeLocationEnhancement)return;
window.__MMAIntakeLocationEnhancement=true;
const sb=window.MobileMechanicSupabase;
if(!sb)return;
const DBKEY='mobile_mechanic_ai_approved_v7';
const NOMINATIM='https://nominatim.openstreetmap.org/search';
const OVERPASS='https://overpass-api.de/api/interpreter';
const TILE='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
let running=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function shopId(){return cache()?.session?.shopId||null;}
function vehicleText(v={}){return [v.year,v.make,v.model,v.submodel||v.trim].filter(Boolean).join(' ')||'Vehicle details pending';}
function engineText(v={}){return [v.engine,v.drivetrain||v.drive,v.mileage?`${Number(v.mileage).toLocaleString()} mi`:null].filter(Boolean).join(' • ');}
function locationText(i={}){
  if(i.address)return String(i.address).trim();
  const c=i.current_location||{};
  if(c.raw)return String(c.raw).trim();
  const lat=c.lat??c.latitude,lng=c.lng??c.lon??c.longitude;
  if(Number.isFinite(Number(lat))&&Number.isFinite(Number(lng)))return `${Number(lat)}, ${Number(lng)}`;
  return '';
}
function coordFromText(value=''){
  const m=String(value).trim().match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(!m)return null;
  const lat=Number(m[1]),lng=Number(m[2]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;
  return {lat,lng,label:value};
}
function miles(a,b,c,d){const R=3958.7613,r=x=>x*Math.PI/180,dl=r(c-a),dn=r(d-b),q=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;return R*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
async function geocode(raw){
  const direct=coordFromText(raw);if(direct)return direct;
  const r=await fetch(`${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(raw)}`,{headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('Could not locate customer address.');
  const data=await r.json();if(!data?.[0])throw new Error('Customer address was not found on the map.');
  return {lat:Number(data[0].lat),lng:Number(data[0].lon),label:data[0].display_name||raw};
}
async function nearbyParts(point){
  const radius=40234;
  const q=`[out:json][timeout:25];(nwr(around:${radius},${point.lat},${point.lng})["shop"="car_parts"];nwr(around:${radius},${point.lat},${point.lng})["name"~"AutoZone|O'Reilly|NAPA|Advance Auto Parts|Carquest|Parts Authority|Pep Boys",i];);out center tags;`;
  const r=await fetch(OVERPASS,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(q)});
  if(!r.ok)throw new Error('Nearby parts search is temporarily unavailable.');
  const data=await r.json(),seen=new Set(),stores=[];
  for(const el of data.elements||[]){
    const lat=el.lat??el.center?.lat,lng=el.lon??el.center?.lon;if(lat==null||lng==null)continue;
    const name=String(el.tags?.name||'Auto Parts Store').trim();
    const key=`${name}|${Number(lat).toFixed(5)}|${Number(lng).toFixed(5)}`;if(seen.has(key))continue;seen.add(key);
    const street=[el.tags?.['addr:housenumber'],el.tags?.['addr:street']].filter(Boolean).join(' ');
    const city=el.tags?.['addr:city']||'';
    stores.push({name,lat:Number(lat),lng:Number(lng),address:[street,city].filter(Boolean).join(', '),phone:el.tags?.phone||el.tags?.['contact:phone']||'',distance:miles(point.lat,point.lng,Number(lat),Number(lng))});
  }
  stores.sort((a,b)=>a.distance-b.distance);
  return stores.slice(0,8);
}
function ensureStyle(){
  if(document.getElementById('mma-intake-location-style'))return;
  const s=document.createElement('style');s.id='mma-intake-location-style';s.textContent=`
  .mma-intake-vehicle-title{font-size:clamp(24px,5vw,34px);font-weight:950;line-height:1.05;letter-spacing:-.4px;color:#fff;margin:0 0 4px}
  .mma-intake-customer-name{font-size:15px;font-weight:850;color:#ff777c;margin-bottom:8px}
  .mma-intake-summary{font-size:13px;line-height:1.45;padding:10px 11px;border:1px solid #303945;border-radius:10px;background:#0b0f14;margin:8px 0}
  .mma-intake-summary b{font-size:12px}.mma-intake-summary .minor{font-size:11px;color:#9aa4b0;margin-top:6px}
  .mma-intake-location-card{margin-top:12px;border:1px solid #6a282d;border-radius:12px;overflow:hidden;background:#0a0e13}
  .mma-intake-location-head{padding:11px 12px;border-bottom:1px solid #29313a;display:flex;justify-content:space-between;gap:10px;align-items:center}
  .mma-intake-location-head b{font-size:14px}.mma-intake-location-head span{font-size:10px;color:#a7b0ba}
  .mma-intake-location-map{height:300px;background:#151a20;z-index:1}
  .mma-intake-parts-status{padding:8px 11px;font-size:11px;color:#b4bdc8;border-top:1px solid #29313a;border-bottom:1px solid #29313a}
  .mma-intake-parts-list{display:grid;gap:7px;padding:10px}
  .mma-intake-part-row{width:100%;text-align:left;border:1px solid #303945;border-radius:9px;padding:9px 10px;background:#10151b;color:#fff}
  .mma-intake-part-row b{display:block;font-size:12px}.mma-intake-part-row span{display:block;font-size:10px;color:#9ca6b1;margin-top:3px}
  @media(max-width:620px){.mma-intake-location-map{height:250px}.mma-intake-vehicle-title{font-size:27px}}
  `;document.head.appendChild(s);
}
function mapOpen(lat,lng){window.open(`https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=16/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`,'_blank','noopener');}
async function mountLocation(box,intake){
  if(box.dataset.mounted==='1')return;box.dataset.mounted='1';
  const raw=locationText(intake);
  if(!raw){box.innerHTML='<div class="mma-intake-summary"><b>Service location missing</b><div class="minor">This customer did not send an address or GPS location.</div></div>';return;}
  box.className='mma-intake-location-card';
  box.innerHTML=`<div class="mma-intake-location-head"><div><b>📍 CUSTOMER LOCATION + NEAREST PARTS</b><br><span>${esc(raw)}</span></div><button type="button" class="btn btn-soft" data-open-customer-map>Open Map</button></div><div class="mma-intake-location-map"></div><div class="mma-intake-parts-status">Locating customer and finding the closest parts sources…</div><div class="mma-intake-parts-list"></div>`;
  const status=box.querySelector('.mma-intake-parts-status'),list=box.querySelector('.mma-intake-parts-list');
  try{
    const point=await geocode(raw);
    box.querySelector('[data-open-customer-map]').onclick=()=>mapOpen(point.lat,point.lng);
    if(!window.L)throw new Error('Map library did not load.');
    const map=L.map(box.querySelector('.mma-intake-location-map'),{zoomControl:true,attributionControl:true}).setView([point.lat,point.lng],13);
    L.tileLayer(TILE,{maxZoom:19,attribution:ATTR}).addTo(map);
    const markers=L.layerGroup().addTo(map);
    L.marker([point.lat,point.lng]).addTo(markers).bindPopup('<b>Customer / vehicle location</b>').openPopup();
    setTimeout(()=>map.invalidateSize(),60);
    let stores=[];
    try{stores=await nearbyParts(point);}catch(err){status.textContent=err.message||'Could not load nearby parts sources.';return;}
    if(!stores.length){status.textContent='Customer mapped. No nearby auto-parts locations were returned by OpenStreetMap for this area.';return;}
    status.textContent=`${stores.length} closest parts source${stores.length===1?'':'s'} found, nearest first.`;
    list.innerHTML=stores.map((s,i)=>`<button type="button" class="mma-intake-part-row" data-store="${i}"><b>${esc(s.name)} — ${s.distance.toFixed(1)} mi</b><span>${esc(s.address||'Address not listed')}${s.phone?` • ${esc(s.phone)}`:''}</span></button>`).join('');
    stores.forEach(s=>L.marker([s.lat,s.lng]).addTo(markers).bindPopup(`<b>${esc(s.name)}</b><br>${s.distance.toFixed(1)} mi away${s.address?`<br>${esc(s.address)}`:''}`));
    const bounds=L.latLngBounds([[point.lat,point.lng],...stores.map(s=>[s.lat,s.lng])]);map.fitBounds(bounds.pad(.15),{maxZoom:13});
    list.querySelectorAll('[data-store]').forEach(btn=>btn.onclick=()=>{const s=stores[Number(btn.dataset.store)];map.setView([s.lat,s.lng],15);mapOpen(s.lat,s.lng);});
  }catch(err){status.textContent=err.message||'Could not map this customer location.';}
}
async function enhanceModal(modal){
  if(!modal||modal.dataset.locationEnhanced==='1'||running)return;
  const buttons=[...modal.querySelectorAll('[data-convert-intake]')];if(!buttons.length)return;
  running=true;
  try{
    const ids=[...new Set(buttons.map(b=>b.dataset.convertIntake).filter(Boolean))],sid=shopId();if(!sid)return;
    const {data,error}=await sb.from('intake_submissions').select('id,customer_name,phone,email,address,current_location,availability,vehicle,customer_states,created_at').eq('shop_id',sid).in('id',ids);
    if(error)throw error;
    const byId=new Map((data||[]).map(x=>[String(x.id),x]));
    buttons.forEach(btn=>{
      const intake=byId.get(String(btn.dataset.convertIntake));if(!intake)return;
      const card=btn.closest('.list-item');const main=btn.closest('.list-main');if(!card||!main||card.dataset.locationEnhanced==='1')return;
      card.dataset.locationEnhanced='1';
      const originalTitle=main.querySelector(':scope > b');if(originalTitle)originalTitle.style.display='none';
      const oldInfo=main.querySelector(':scope > p');if(oldInfo)oldInfo.style.display='none';
      const v=intake.vehicle||{},loc=locationText(intake);
      const header=document.createElement('div');
      header.innerHTML=`<div class="mma-intake-vehicle-title">${esc(vehicleText(v))}</div><div class="mma-intake-customer-name">${esc(intake.customer_name||'Customer')}</div>${engineText(v)?`<div class="small muted" style="margin-bottom:8px">${esc(engineText(v))}</div>`:''}<div class="mma-intake-summary"><b>Customer concern</b><div>${esc(intake.customer_states||'No concern entered')}</div><div class="minor">${loc?`📍 ${esc(loc)}<br>`:''}${esc(intake.phone||'No phone')}${intake.email?` • ${esc(intake.email)}`:''}${intake.availability?`<br>Preferred: ${esc(intake.availability)}`:''}</div></div>`;
      main.prepend(header);
      const mapBox=document.createElement('div');mapBox.dataset.intakeLocationMap='1';
      const ai=[...main.children].find(el=>/AI PRE-WORKUP|AI pre-workup/i.test(el.textContent||''));
      if(ai)ai.insertAdjacentElement('beforebegin',mapBox);else main.appendChild(mapBox);
      mountLocation(mapBox,intake);
    });
    modal.dataset.locationEnhanced='1';
    const box=modal.querySelector('.modal');if(box)box.style.maxWidth='1080px';
  }catch(err){console.warn('Customer location enhancement failed',err);}
  finally{running=false;}
}
function enhance(){ensureStyle();document.querySelectorAll('[data-intake-queue-modal]').forEach(enhanceModal);}
new MutationObserver(()=>setTimeout(enhance,60)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(enhance,80));
setTimeout(enhance,350);
})();
