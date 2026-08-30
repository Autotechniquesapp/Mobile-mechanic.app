(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
const SOLO_INCLUDED_LOOKUPS=10;
const SOLO_ADDON_LOOKUPS=50;
const FEATURE='youtube_video_lookup';
const sb=window.MobileMechanicSupabase;
function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find(j=>String(j.id)===String(db.session?.activeJobId));return {db,shop,job};}
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
  }catch(err){tab?.close();toast(err?.message||'Could not start repair-video search.','bad');}
}
function markup(){return `<div data-youtube-repair style="display:flex;justify-content:flex-end;margin:7px 0 10px"><button class="btn btn-soft" type="button" data-youtube-search style="padding:6px 10px;min-height:32px;font-size:12px">▶ Repair Videos</button></div>`;}
function mount(){
  const {db,job}=context();
  if(db.session?.role!=='shop'||!job||document.querySelector('[data-youtube-repair]'))return;
  const ai=document.querySelector('[data-aiq-panel]');
  const help=document.querySelector('[data-technician-help],[data-tech-help]');
  const anchor=ai||help;
  if(!anchor)return;
  anchor.insertAdjacentHTML('beforebegin',markup());
}
function loadFeature(src,attr){
  if(document.querySelector(`script[${attr}]`))return;
  const s=document.createElement('script');s.setAttribute(attr,'1');s.src=`${src}?v=20260829-2123`;document.body.appendChild(s);
}
function loadWorkOrder(){loadFeature('job-work-order.js','data-job-work-order-loader');loadFeature('next-invoice.js','data-next-invoice-loader');}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-youtube-search]');if(!b)return;e.preventDefault();openSearch('');},true);
new MutationObserver(()=>setTimeout(mount,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(mount,100));
loadWorkOrder();
setTimeout(mount,700);
})();