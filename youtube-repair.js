(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find(j=>String(j.id)===String(db.session?.activeJobId));return {db,shop,job};}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function query(job,extra=''){
  const v=job?.vehicle||{};
  const vehicle=[v.year, v.make, v.model, v.submodel, v.engine].filter(Boolean).join(' ');
  const codes=Array.isArray(job?.codes)?job.codes.join(' '):String(job?.codes||'');
  const concern=String(job?.customerStates||job?.customer_states||job?.complaint||'').slice(0,180);
  return [vehicle,codes,concern,extra,'repair diagnosis'].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}
function openSearch(extra=''){const {job}=context();if(!job)return;const q=query(job,extra);window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,'_blank','noopener');}
function markup(job){const q=query(job);return `<section class="card card-pad" data-youtube-repair style="margin:12px 0"><div class="card-title">REPAIR VIDEOS</div><div class="section-note">Search YouTube using this vehicle and job context. No paid video API is required.</div><div class="divider"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><input data-youtube-extra placeholder="Optional: procedure or component" style="flex:1;min-width:190px;background:#080c10;color:#f5f6f8;border:1px solid #303945;border-radius:8px;padding:9px 10px"><button class="btn btn-soft" type="button" data-youtube-search>Search Repair Videos</button></div><div class="small muted" style="margin-top:7px">Search: ${esc(q)}</div></section>`;}
function mount(){const {db,job}=context();if(db.session?.role!=='shop'||!job||document.querySelector('[data-youtube-repair]'))return;const ai=document.querySelector('[data-aiq-panel]');const help=document.querySelector('[data-technician-help],[data-tech-help]');const anchor=ai||help;if(!anchor)return;anchor.insertAdjacentHTML('beforebegin',markup(job));}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-youtube-search]');if(!b)return;e.preventDefault();const extra=document.querySelector('[data-youtube-extra]')?.value||'';openSearch(extra);},true);
new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(mount,100));
setTimeout(mount,700);
})();