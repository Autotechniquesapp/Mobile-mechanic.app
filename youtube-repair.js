(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
const SOLO_INCLUDED_LOOKUPS=10;
const SOLO_ADDON_LOOKUPS=50;
const FEATURE='youtube_video_lookup';
const sb=window.MobileMechanicSupabase;
function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find(j=>String(j.id)===String(db.session?.activeJobId));return {db,shop,job};}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function toast(msg,type=''){document.querySelector('.youtube-toast')?.remove();const d=document.createElement('div');d.className=`toast youtube-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),4500);}
function query(job,extra=''){
  const v=job?.vehicle||{};
  const vehicle=[v.year,v.make,v.model,v.submodel||v.trim,v.engine].filter(Boolean).join(' ');
  const codes=Array.isArray(job?.codes)?job.codes.join(' '):String(job?.codes||'');
  const concern=String(job?.customerStates||job?.customer_states||job?.complaint||'').slice(0,180);
  return [vehicle,codes,concern,extra,'repair diagnosis'].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}
function plan(shop){const p=String(shop?.plan||'solo');return p==='pro_fleet'?'pro':p;}
function hasPack(shop){return Array.isArray(shop?.addons)&&shop.addons.includes('youtube_lookup_pack');}
function monthStart(){const n=new Date();return new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),1)).toISOString();}
async function usage(shop){
  if(!sb||!shop?.id||plan(shop)!=='solo')return {used:0,limit:null};
  const limit=SOLO_INCLUDED_LOOKUPS+(hasPack(shop)?SOLO_ADDON_LOOKUPS:0);
  const {count,error}=await sb.from('feature_usage_events').select('id',{count:'exact',head:true}).eq('shop_id',shop.id).eq('feature',FEATURE).gte('created_at',monthStart());
  if(error)throw error;
  return {used:Number(count||0),limit};
}
async function record(shop,job,extra){
  if(!sb||!shop?.id)return;
  const {data:{session}}=await sb.auth.getSession();
  const {error}=await sb.from('feature_usage_events').insert({shop_id:shop.id,user_id:session?.user?.id||null,feature:FEATURE,quantity:1,metadata:{job_id:job?.id||null,query_extra:String(extra||'').slice(0,120)}});
  if(error)throw error;
}
function searchUrl(job,extra=''){return `https://www.youtube.com/results?search_query=${encodeURIComponent(query(job,extra))}`;}
async function openSearch(extra=''){
  const {shop,job}=context();if(!job)return;
  const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
  try{
    if(plan(shop)==='solo'){
      const q=await usage(shop);
      if(q.limit!==null&&q.used>=q.limit){tab?.close();toast(`Solo repair-video limit reached (${q.limit}/month). Add the YouTube Lookup Pack for 50 more lookups this month.`,'bad');return;}
    }
    await record(shop,job,extra);
    const url=searchUrl(job,extra);
    if(tab)tab.location.href=url;else location.href=url;
    updateUsage().catch(()=>{});
  }catch(err){tab?.close();toast(err?.message||'Could not start repair-video search.','bad');}
}
function markup(job,shop){const q=query(job),p=plan(shop);const quota=p==='solo'?`<div class="small muted" data-youtube-usage style="margin-top:7px">Checking Solo monthly lookup allowance…</div>`:'<div class="small muted" style="margin-top:7px">Unlimited repair-video lookups on this plan.</div>';return `<section class="card card-pad" data-youtube-repair style="margin:12px 0"><div class="card-title">REPAIR VIDEOS</div><div class="section-note">Search YouTube using this vehicle and job context. No paid video API is required.</div><div class="divider"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><input data-youtube-extra placeholder="Optional: procedure or component" style="flex:1;min-width:190px;background:#080c10;color:#f5f6f8;border:1px solid #303945;border-radius:8px;padding:9px 10px"><button class="btn btn-soft" type="button" data-youtube-search>Search Repair Videos</button></div><div class="small muted" style="margin-top:7px">Search: ${esc(q)}</div>${quota}</section>`;}
async function updateUsage(){const {shop}=context(),el=document.querySelector('[data-youtube-usage]');if(!el||!shop||plan(shop)!=='solo')return;try{const q=await usage(shop);const pack=hasPack(shop)?' Includes active +50 Lookup Pack.':' Add the +50 Lookup Pack from Billing if you need more.';el.textContent=`Solo usage: ${q.used}/${q.limit} repair-video lookups this month.${pack}`;}catch{el.textContent=`Solo includes ${SOLO_INCLUDED_LOOKUPS} repair-video lookups per month.`;}}
function mount(){const {db,shop,job}=context();if(db.session?.role!=='shop'||!job||document.querySelector('[data-youtube-repair]'))return;const ai=document.querySelector('[data-aiq-panel]');const help=document.querySelector('[data-technician-help],[data-tech-help]');const anchor=ai||help;if(!anchor)return;anchor.insertAdjacentHTML('beforebegin',markup(job,shop));updateUsage().catch(()=>{});}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-youtube-search]');if(!b)return;e.preventDefault();const extra=document.querySelector('[data-youtube-extra]')?.value||'';openSearch(extra);},true);
new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(mount,100));
setTimeout(mount,700);
})();