(() => {
  'use strict';

  const DBKEY = 'mobile_mechanic_ai_approved_v7';
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
  const panels = new WeakMap();

  function esc(v='') {
    return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function coordFromText(value='') {
    const m = String(value).trim().match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {lat, lng};
  }

  function distanceMiles(aLat,aLng,bLat,bLng) {
    const R=3958.7613, rad=d=>d*Math.PI/180;
    const dLat=rad(bLat-aLat), dLng=rad(bLng-aLng);
    const a=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  function readActiveJobLocation() {
    try {
      const db=JSON.parse(localStorage.getItem(DBKEY)||'{}');
      const shop=db.shops?.[db.session?.shopId];
      const job=shop?.jobs?.find(j=>j.id===db.session?.activeJobId) || shop?.jobs?.[0];
      return job?.location || '';
    } catch { return ''; }
  }

  function createPanel({compact=false, input=null, initialLocation='' }={}) {
    const panel=document.createElement('div');
    panel.className=`mma-map-tools${compact?' mma-map-inline':''}`;
    panel.innerHTML=`
      <div class="mma-map-tools-head">
        <div><b>FREE LOCATION MAP</b><br><span>Leaflet + OpenStreetMap — no Google Maps API key</span></div>
        <span class="mma-map-badge">OPEN SOURCE</span>
      </div>
      ${compact?'':`<div class="mma-map-search-row"><input class="mma-map-location" placeholder="Address or latitude, longitude" value="${esc(initialLocation)}"><button type="button" class="btn btn-soft mma-map-search">Show Location</button></div>`}
      <div class="mma-map-actions">
        <button type="button" class="btn btn-primary mma-map-locate">Use My Current Location</button>
        <button type="button" class="btn btn-soft mma-map-parts">Find Nearby Parts</button>
        <button type="button" class="btn btn-soft mma-map-open">Open Full Map</button>
      </div>
      <div class="mma-map-status">Choose a location to show the map.</div>
      <div class="mma-map-canvas"></div>
      <div class="mma-map-results" hidden></div>`;

    const canvas=panel.querySelector('.mma-map-canvas');
    const map=L.map(canvas,{zoomControl:true,attributionControl:true}).setView([39.8283,-98.5795],4);
    L.tileLayer(TILE_URL,{maxZoom:19,attribution:TILE_ATTR}).addTo(map);
    const markerLayer=L.layerGroup().addTo(map);
    const state={map,markerLayer,point:null,input};
    panels.set(panel,state);

    panel.querySelector('.mma-map-locate').addEventListener('click',()=>locate(panel));
    panel.querySelector('.mma-map-parts').addEventListener('click',()=>findParts(panel));
    panel.querySelector('.mma-map-open').addEventListener('click',()=>openFullMap(panel));
    panel.querySelector('.mma-map-search')?.addEventListener('click',()=>showTypedLocation(panel));
    panel.querySelector('.mma-map-location')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();showTypedLocation(panel);}});

    if (initialLocation) setTimeout(()=>setFromLocationText(panel,initialLocation,false),100);
    setTimeout(()=>map.invalidateSize(),80);
    return panel;
  }

  function setStatus(panel,text){ const el=panel.querySelector('.mma-map-status'); if(el)el.textContent=text; }

  function setPoint(panel,point,label='Job / customer location',writeInput=true) {
    const state=panels.get(panel); if(!state)return;
    state.point={lat:Number(point.lat),lng:Number(point.lng)};
    state.markerLayer.clearLayers();
    L.marker([state.point.lat,state.point.lng]).addTo(state.markerLayer).bindPopup(`<b>${esc(label)}</b>`).openPopup();
    mapFocus(state.map,state.point.lat,state.point.lng,14);
    const coord=`${state.point.lat.toFixed(5)}, ${state.point.lng.toFixed(5)}`;
    if (writeInput && state.input) state.input.value=coord;
    const search=panel.querySelector('.mma-map-location'); if(search && writeInput) search.value=coord;
    setStatus(panel,`${label}: ${coord}`);
  }

  function mapFocus(map,lat,lng,zoom){ map.setView([lat,lng],zoom); setTimeout(()=>map.invalidateSize(),50); }

  function locate(panel) {
    if(!navigator.geolocation){setStatus(panel,'Location is not supported on this device.');return;}
    setStatus(panel,'Getting current GPS location…');
    navigator.geolocation.getCurrentPosition(p=>{
      setPoint(panel,{lat:p.coords.latitude,lng:p.coords.longitude},'Current location',true);
      const accuracy=Math.round(p.coords.accuracy||0);
      if(accuracy) setStatus(panel,`Current location found — about ${accuracy} m accuracy.`);
    },()=>setStatus(panel,'Location permission was not granted. You can enter an address instead.'),{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  }

  async function geocode(address) {
    const url=`${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
    const r=await fetch(url,{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('geocode');
    const data=await r.json();
    if(!data?.[0])throw new Error('notfound');
    return {lat:Number(data[0].lat),lng:Number(data[0].lon),label:data[0].display_name||address};
  }

  async function setFromLocationText(panel,text,writeInput=false) {
    const raw=String(text||'').trim(); if(!raw)return;
    const coord=coordFromText(raw);
    if(coord){setPoint(panel,coord,'Saved location',writeInput);return;}
    setStatus(panel,'Finding that address with OpenStreetMap…');
    try{const p=await geocode(raw);setPoint(panel,p,p.label,writeInput);}
    catch{setStatus(panel,'Could not locate that address. Try a more complete address or use current location.');}
  }

  function showTypedLocation(panel){
    const input=panel.querySelector('.mma-map-location');
    if(input) setFromLocationText(panel,input.value,false);
  }

  async function ensurePoint(panel) {
    const state=panels.get(panel); if(state?.point)return state.point;
    const raw=state?.input?.value || panel.querySelector('.mma-map-location')?.value || readActiveJobLocation();
    if(raw){await setFromLocationText(panel,raw,false);if(state?.point)return state.point;}
    return null;
  }

  async function findParts(panel) {
    const state=panels.get(panel); if(!state)return;
    setStatus(panel,'Preparing nearby parts search…');
    const point=await ensurePoint(panel);
    if(!point){setStatus(panel,'Choose a location first, then search for nearby parts.');return;}
    setStatus(panel,'Searching OpenStreetMap for nearby auto-parts stores…');
    const radius=16093;
    const query=`[out:json][timeout:20];(nwr(around:${radius},${point.lat},${point.lng})["shop"="car_parts"];nwr(around:${radius},${point.lat},${point.lng})["name"~"AutoZone|O'Reilly|NAPA|Advance Auto Parts|Carquest",i];);out center tags;`;
    try{
      const r=await fetch(OVERPASS_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query)});
      if(!r.ok)throw new Error('overpass');
      const data=await r.json(), seen=new Set(), stores=[];
      for(const el of data.elements||[]){
        const lat=el.lat??el.center?.lat,lng=el.lon??el.center?.lon;if(lat==null||lng==null)continue;
        const name=el.tags?.name||'Auto Parts Store', key=`${name}|${Number(lat).toFixed(5)}|${Number(lng).toFixed(5)}`;if(seen.has(key))continue;seen.add(key);
        const street=[el.tags?.['addr:housenumber'],el.tags?.['addr:street']].filter(Boolean).join(' ');
        const city=el.tags?.['addr:city']||'';
        stores.push({name,lat:Number(lat),lng:Number(lng),phone:el.tags?.phone||el.tags?.['contact:phone']||'',address:[street,city].filter(Boolean).join(', ')});
      }
      stores.sort((a,b)=>distanceMiles(point.lat,point.lng,a.lat,a.lng)-distanceMiles(point.lat,point.lng,b.lat,b.lng));
      renderStores(panel,stores.slice(0,20));
    }catch{setStatus(panel,'The free nearby-store service is busy right now. GPS and the OpenStreetMap map still work.');}
  }

  function renderStores(panel,stores) {
    const state=panels.get(panel), results=panel.querySelector('.mma-map-results');
    if(!stores.length){results.hidden=true;setStatus(panel,'No nearby auto-parts stores were found in OpenStreetMap data for this area.');return;}
    results.hidden=false;
    results.innerHTML=stores.map((s,i)=>{
      const miles=distanceMiles(state.point.lat,state.point.lng,s.lat,s.lng).toFixed(1);
      return `<button type="button" class="mma-map-result" data-store="${i}"><b>${esc(s.name)}</b><span>${miles} mi${s.address?' • '+esc(s.address):''}${s.phone?' • '+esc(s.phone):''}</span></button>`;
    }).join('');
    state.stores=stores;
    stores.forEach(s=>L.marker([s.lat,s.lng]).addTo(state.markerLayer).bindPopup(`<b>${esc(s.name)}</b>${s.address?`<br>${esc(s.address)}`:''}`));
    const bounds=L.latLngBounds([[state.point.lat,state.point.lng],...stores.map(s=>[s.lat,s.lng])]);state.map.fitBounds(bounds.pad(.15),{maxZoom:14});
    results.querySelectorAll('[data-store]').forEach(b=>b.addEventListener('click',()=>{
      const s=stores[Number(b.dataset.store)];state.map.setView([s.lat,s.lng],15);state.markerLayer.eachLayer(layer=>{const ll=layer.getLatLng?.();if(ll&&Math.abs(ll.lat-s.lat)<.00001&&Math.abs(ll.lng-s.lng)<.00001)layer.openPopup();});
    }));
    setStatus(panel,`Found ${stores.length} nearby parts location${stores.length===1?'':'s'}. Store coverage depends on OpenStreetMap data.`);
  }

  async function openFullMap(panel) {
    const state=panels.get(panel); const p=state?.point || await ensurePoint(panel);
    if(p) window.open(`https://www.openstreetmap.org/?mlat=${encodeURIComponent(p.lat)}&mlon=${encodeURIComponent(p.lng)}#map=15/${encodeURIComponent(p.lat)}/${encodeURIComponent(p.lng)}`,'_blank','noopener');
    else {
      const raw=state?.input?.value||panel.querySelector('.mma-map-location')?.value||'';
      if(raw)window.open(`https://www.openstreetmap.org/search?query=${encodeURIComponent(raw)}`,'_blank','noopener');
    }
  }

  function enhanceIntake() {
    const input=document.getElementById('serviceLocation');
    if(!input || input.dataset.freeMapReady==='1')return;
    input.dataset.freeMapReady='1';
    const field=input.closest('.field'); if(!field)return;
    const panel=createPanel({compact:true,input,initialLocation:input.value});
    field.appendChild(panel);
  }

  function enhanceParts() {
    const title=[...document.querySelectorAll('.page-title h2')].find(h=>h.textContent.trim()==='Parts & Warranty Vault');
    if(!title)return;
    const content=title.closest('.content');if(!content||content.querySelector('[data-mma-parts-map]'))return;
    const wrap=document.createElement('section');wrap.className='card card-pad';wrap.style.marginTop='10px';wrap.dataset.mmaPartsMap='1';
    wrap.innerHTML='<div class="card-title">NEARBY PARTS MAP</div><div class="section-note">Free/open-source location lookup. Live store inventory and pricing still require supplier integrations.</div><div class="divider"></div>';
    wrap.appendChild(createPanel({initialLocation:readActiveJobLocation()}));
    content.appendChild(wrap);
  }

  function enhance() { if(!window.L)return; enhanceIntake(); enhanceParts(); }

  document.addEventListener('click',e=>{
    const locationBtn=e.target.closest?.('[data-action="location"]');
    if(locationBtn){
      const panel=document.getElementById('serviceLocation')?.closest('.field')?.querySelector('.mma-map-tools');
      if(panel){e.preventDefault();e.stopImmediatePropagation();locate(panel);return;}
    }
    const mapBtn=e.target.closest?.('[data-action="open-maps"]');
    if(mapBtn){
      const loc=mapBtn.dataset.location||'';if(!loc)return;
      e.preventDefault();e.stopImmediatePropagation();
      const p=coordFromText(loc);
      const url=p?`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=15/${p.lat}/${p.lng}`:`https://www.openstreetmap.org/search?query=${encodeURIComponent(loc)}`;
      window.open(url,'_blank','noopener');
    }
  },true);

  const observer=new MutationObserver(()=>enhance());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(enhance,30));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
})();
