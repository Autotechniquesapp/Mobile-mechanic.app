(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
if(!sb)return;
let running=false;

function shopId(){
  try{return JSON.parse(localStorage.getItem(DBKEY)||'{}')?.session?.shopId||null;}
  catch{return null;}
}

async function pendingCount(){
  const sid=shopId();
  if(!sid)return 0;
  const {count,error}=await sb.from('intake_submissions').select('id',{count:'exact',head:true}).eq('shop_id',sid).eq('status','new');
  if(error)throw error;
  return Number(count||0);
}

function dashboardVisible(){
  return !!document.querySelector('.dash-head, .dashboard, [data-dashboard], .quick-actions');
}

function render(count){
  const existing=document.querySelector('[data-production-intake-queue]');
  if(count<=0){
    if(existing?.dataset?.mmaDashboardFix==='1') existing.remove();
    return;
  }
  let btn=existing;
  if(!btn){
    btn=document.createElement('button');
    btn.type='button';
    btn.dataset.productionIntakeQueue='1';
    btn.dataset.mmaDashboardFix='1';
    btn.className='priority-strip';
    btn.style.cssText='width:100%;border:1px solid #ef2a31;text-align:left;cursor:pointer;margin:12px 0;padding:14px 16px;border-radius:14px;display:flex;gap:10px;align-items:center;justify-content:space-between;background:#15191f;color:inherit';

    const share=[...document.querySelectorAll('button,a,.card,.list-item')].find(el=>/Share Intake Link/i.test(el.textContent||''));
    const head=document.querySelector('.dash-head');
    if(share?.parentElement) share.insertAdjacentElement('afterend',btn);
    else if(head) head.insertAdjacentElement('afterend',btn);
    else document.querySelector('.content,main,#app')?.prepend(btn);
  }
  btn.innerHTML=`<span style="font-size:20px">📥</span><b style="flex:1">${count} Customer Intake${count===1?'':'s'} Waiting</b><span>Open ›</span>`;
  btn.dataset.intakeCount=String(count);
}

async function refresh(){
  if(running||document.hidden||!dashboardVisible())return;
  running=true;
  try{render(await pendingCount());}
  catch(err){console.warn('Could not show waiting intake count',err);}
  finally{running=false;}
}

let scheduled=false;
new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  setTimeout(()=>{scheduled=false;refresh();},120);
}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(refresh,150));
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setTimeout(refresh,350);
})();
