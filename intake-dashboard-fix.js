(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
if(!sb)return;
let running=false;
let realtimeChannel=null;
let lastShopId=null;

function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function shopId(){return cache()?.session?.shopId||null;}
function shop(){const d=cache(),sid=d?.session?.shopId;return sid?d?.shops?.[sid]||null:null;}
function intakeUrl(){const s=shop();return s?.slug?`${location.origin}/?intake=${encodeURIComponent(s.slug)}`:'';}
function isDashboard(){return (location.hash||'#dashboard').split('?')[0]==='#dashboard';}
function dashboardVisible(){return isDashboard()&&!!document.querySelector('.mmp-page-head,.dash-head,.dashboard,[data-dashboard],.mmp-quick,.quick-actions,main.content');}

async function pendingCount(){
  const sid=shopId();
  if(!sid)return null;
  const {count,error}=await sb.from('intake_submissions').select('id',{count:'exact',head:true}).eq('shop_id',sid).eq('status','new');
  if(error)throw error;
  return Number(count||0);
}

async function shareIntake(){
  const url=intakeUrl();
  if(!url)return;
  const s=shop();
  const text=`Please fill out this vehicle intake for ${s?.name||'the shop'}.`;
  try{
    if(navigator.share)await navigator.share({title:`${s?.name||'Shop'} Customer Intake`,text,url});
    else if(navigator.clipboard){await navigator.clipboard.writeText(`${text}\n${url}`);toast('Customer intake link copied.');}
  }catch(err){if(err?.name!=='AbortError')console.warn('Could not share intake link',err);}
}
function copyIntake(){const url=intakeUrl();if(!url)return;navigator.clipboard?.writeText(url).then(()=>toast('Customer intake link copied.')).catch(()=>{});}
function toast(message){document.querySelector('.mma-intake-dashboard-toast')?.remove();const d=document.createElement('div');d.className='toast good mma-intake-dashboard-toast';d.textContent=message;document.body.appendChild(d);setTimeout(()=>d.remove(),3200);}

function card(){
  let el=document.querySelector('[data-mma-intake-dashboard-card]');
  if(el)return el;
  el=document.createElement('section');
  el.className='card card-pad';
  el.dataset.mmaIntakeDashboardCard='1';
  el.style.cssText='margin:12px 0;border:1px solid #5c2227;background:#11161c';
  const head=document.querySelector('.mmp-page-head,.dash-head');
  if(head)head.insertAdjacentElement('afterend',el);
  else document.querySelector('main.content,.content,#app')?.prepend(el);
  return el;
}

function render(count){
  if(!dashboardVisible())return;
  const el=card();
  if(!el)return;
  const url=intakeUrl();
  const n=Number(count||0);
  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px;min-width:0">
        <span style="font-size:24px">📥</span>
        <div><b style="display:block">PENDING CUSTOMER INTAKES</b><span class="muted small">${n===1?'1 customer is waiting':`${n} customers are waiting`}</span></div>
      </div>
      <strong style="font-size:30px;color:${n?'#ff6b70':'inherit'}">${n}</strong>
    </div>
    <div class="btn-row" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn ${n?'btn-primary':'btn-soft'}" data-production-intake-queue data-mma-dashboard-fix="1">${n?`OPEN ${n} INTAKE${n===1?'':'S'}`:'OPEN INTAKE QUEUE'}</button>
      <button type="button" class="btn btn-primary" data-mma-share-intake>SHARE INTAKE</button>
      <button type="button" class="btn btn-soft" data-mma-copy-intake ${url?'':'disabled'}>COPY LINK</button>
    </div>
    ${url?`<div class="small muted" style="margin-top:9px;overflow-wrap:anywhere">${url}</div>`:'<div class="small muted" style="margin-top:9px">Shop intake link is loading…</div>'}`;
  el.dataset.intakeCount=String(n);
}

async function refresh(){
  if(running||document.hidden||!dashboardVisible())return;
  const sid=shopId();
  if(!sid){setTimeout(refresh,500);return;}
  running=true;
  try{const count=await pendingCount();if(count!==null)render(count);}
  catch(err){console.warn('Could not refresh customer intake count',err);}
  finally{running=false;}
  ensureRealtime();
}

function ensureRealtime(){
  const sid=shopId();
  if(!sid)return;
  if(realtimeChannel&&lastShopId===sid)return;
  if(realtimeChannel)sb.removeChannel(realtimeChannel);
  lastShopId=sid;
  realtimeChannel=sb.channel(`dashboard-intakes-${sid}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'intake_submissions',filter:`shop_id=eq.${sid}`},()=>setTimeout(refresh,80))
    .subscribe();
}

document.addEventListener('click',e=>{
  const share=e.target.closest?.('[data-mma-share-intake]');
  if(share){e.preventDefault();e.stopPropagation();shareIntake();return;}
  const copy=e.target.closest?.('[data-mma-copy-intake]');
  if(copy){e.preventDefault();e.stopPropagation();copyIntake();}
},true);

let scheduled=false;
new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  setTimeout(()=>{scheduled=false;refresh();},120);
}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(refresh,120));
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden&&isDashboard())refresh();},15000);
setTimeout(refresh,250);
})();
