(() => {
'use strict';
const SUPABASE_URL='https://rapcejqlydedceegbcrs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_w8kcE-A3iHqL9YHr_MiTNQ_WtkWaNJx';
const sb=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
if(!sb)return;
let busy=false,lastRun=0,timer=null;
const date=v=>v?new Date(v).toLocaleDateString():'—';
function duration(v){
  if(!v)return '';
  const ms=Math.max(0,Date.now()-new Date(v).getTime());
  const days=Math.floor(ms/86400000);
  if(days<1){const h=Math.max(1,Math.floor(ms/3600000));return `${h} hour${h===1?'':'s'}`;}
  if(days<30)return `${days} day${days===1?'':'s'}`;
  const months=Math.floor(days/30);
  if(months<12)return `${months} month${months===1?'':'s'}`;
  const years=Math.floor(days/365),rem=Math.floor((days%365)/30);
  return `${years} year${years===1?'':'s'}${rem?` ${rem} mo`:''}`;
}
async function overview(){
  const {data,error}=await sb.functions.invoke('platform-admin',{body:{action:'overview'}});
  if(error)throw error;if(data?.error)throw new Error(data.error);return data;
}
async function decorate(force=false){
  if(busy)return;
  if(!document.querySelector('[data-shop-id]'))return;
  if(!force&&Date.now()-lastRun<1500)return;
  busy=true;lastRun=Date.now();
  try{
    const data=await overview();
    const map=new Map((data.shops||[]).map(s=>[s.shop_id,s]));
    document.querySelectorAll('[data-shop-id]').forEach(row=>{
      const s=map.get(row.dataset.shopId);if(!s)return;
      row.querySelectorAll('[data-comp-meta]').forEach(x=>x.remove());
      const status=row.querySelector('[data-label="Status"]');
      const trial=row.querySelector('[data-label="Trial"]');
      const shop=row.querySelector('[data-label="Shop"]');
      if(s.billing_status==='comped'){
        const meta=document.createElement('div');meta.dataset.compMeta='1';meta.style.cssText='margin-top:5px;font-size:10px;color:#8e98a5;line-height:1.35';
        meta.textContent=s.comped_at?`Comped since ${date(s.comped_at)} · ${duration(s.comped_at)}`:'Comped';
        status?.appendChild(meta);
        if(s.comped_permanent){
          const badge=document.createElement('div');badge.dataset.compMeta='1';badge.style.cssText='margin-top:5px;color:#75d894;font-size:10px;font-weight:850;letter-spacing:.35px;text-transform:uppercase';badge.textContent='Permanent comp account';shop?.appendChild(badge);
          if(trial){trial.textContent='Permanent';const since=document.createElement('div');since.dataset.compMeta='1';since.style.cssText='margin-top:3px;font-size:10px;color:#8e98a5';since.textContent=s.comped_at?`Since ${date(s.comped_at)}`:'';trial.appendChild(since);}
        }
      }
    });
  }catch(err){console.warn('Could not decorate comped account duration',err);}
  finally{busy=false;}
}
const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>decorate(),180);});
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',()=>decorate(true));
setTimeout(()=>decorate(true),700);
})();
