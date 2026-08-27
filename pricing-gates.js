(() => {
'use strict';

const DBKEY = 'mobile_mechanic_ai_approved_v7';
const FALLBACK = {
  solo:{code:'solo',name:'Solo',price:69,seats:1,description:'Independent mobile mechanic',features:['customer_intake','customers_vehicles','jobs','basic_ai_workup','good_better_best','secure_estimate_approval','voice_notes','quick_quote','calendar','basic_reports','data_export']},
  shop:{code:'shop',name:'Shop',price:149,seats:5,description:'Growing mobile mechanic or repair shop',features:['customer_intake','customers_vehicles','jobs','basic_ai_workup','good_better_best','secure_estimate_approval','voice_notes','quick_quote','calendar','basic_reports','data_export','ai_second_opinion','prepurchase_inspection','parts_tools','warranty_comebacks','templates','team_accounts','carfax_ready','training']},
  pro:{code:'pro_fleet',name:'Pro / Fleet',price:249,seats:15,description:'Larger shop, fleet, and roadside operations',features:['customer_intake','customers_vehicles','jobs','basic_ai_workup','good_better_best','secure_estimate_approval','voice_notes','quick_quote','calendar','basic_reports','data_export','ai_second_opinion','prepurchase_inspection','parts_tools','warranty_comebacks','templates','team_accounts','carfax_ready','training','fleet','roadside','advanced_reports','priority_support']}
};

const routeFeatures = {
  'ai-second':'ai_second_opinion',
  inspection:'prepurchase_inspection',
  parts:'parts_tools',
  warranty:'warranty_comebacks',
  templates:'templates',
  team:'team_accounts',
  carfax:'carfax_ready',
  training:'training',
  fleet:'fleet',
  roadside:'roadside'
};
const actionFeatures = {
  'second-opinion':'ai_second_opinion',
  'prepare-carfax':'carfax_ready'
};
const requiredPlan = {
  ai_second_opinion:'Shop',prepurchase_inspection:'Shop',parts_tools:'Shop',warranty_comebacks:'Shop',templates:'Shop',team_accounts:'Shop',carfax_ready:'Shop',training:'Shop',fleet:'Pro / Fleet',roadside:'Pro / Fleet',advanced_reports:'Pro / Fleet',priority_support:'Pro / Fleet'
};

let catalog = structuredClone(FALLBACK);
let observer;

function readCache(){try{return JSON.parse(localStorage.getItem(DBKEY))||{};}catch{return {};}}
function currentPlan(){
  const db=readCache(), sid=db.session?.shopId, raw=db.shops?.[sid]?.plan||'solo';
  return raw==='pro_fleet'?'pro':raw;
}
function allowed(feature){return (catalog[currentPlan()]?.features||[]).includes(feature);}
function priceText(n){return `$${Number(n).toFixed(0)}`;}
function notice(message){
  document.querySelector('.mma-plan-toast')?.remove();
  const d=document.createElement('div');
  d.className='toast mma-plan-toast'; d.textContent=message;
  document.body.appendChild(d); setTimeout(()=>d.remove(),3600);
}
function blockFeature(feature){
  const plan=requiredPlan[feature]||'higher';
  notice(`${plan} plan required for this feature. Your core intake, jobs, estimates, and customer approvals remain available on your current plan.`);
}

async function loadCatalog(){
  const sb=window.MobileMechanicSupabase;if(!sb)return;
  try{
    const {data,error}=await sb.from('plan_catalog').select('code,name,monthly_price,included_seats,description,features').eq('active',true).order('sort_order');
    if(error||!data?.length)return;
    const next={};
    for(const p of data){
      const key=p.code==='pro_fleet'?'pro':p.code;
      next[key]={code:p.code,name:p.name,price:Number(p.monthly_price),seats:Number(p.included_seats),description:p.description||'',features:Array.isArray(p.features)?p.features:[]};
    }
    catalog={...catalog,...next};
  }catch(err){console.warn('Plan catalog fallback in use',err);}
}

function updatePlanCards(){
  document.querySelectorAll('.plan-card').forEach(card=>{
    const input=card.querySelector('input[name="plan"]');if(!input)return;
    const p=catalog[input.value];if(!p)return;
    const name=card.querySelector('b'),strong=card.querySelector('strong'),span=card.querySelector('span');
    if(name)name.textContent=p.name;
    if(strong)strong.innerHTML=`${priceText(p.price)}<small>/mo</small>`;
    if(span)span.innerHTML=`${p.description}<br>Up to ${p.seats} user${p.seats===1?'':'s'}`;
  });
  document.querySelectorAll('.subscription-card').forEach(card=>{
    const title=(card.querySelector('h3')?.textContent||'').toLowerCase();
    const key=title.includes('pro')?'pro':title.includes('solo')?'solo':'shop';
    const p=catalog[key];if(!p)return;
    const price=card.querySelector('.price');if(price)price.innerHTML=`${priceText(p.price)}<small>/month</small>`;
  });
}

function lockElement(el,feature){
  if(el.dataset.mmaGate==='1')return;
  el.dataset.mmaGate='1';
  el.setAttribute('aria-disabled','true');
  el.title=`Requires ${requiredPlan[feature]||'a higher'} plan`;
  el.style.opacity='.58';
  if(!el.querySelector('.mma-lock-badge')){
    const badge=document.createElement('span');badge.className='badge mma-lock-badge';
    badge.textContent=`LOCKED • ${requiredPlan[feature]||'UPGRADE'}`;
    badge.style.marginLeft='6px';badge.style.fontSize='10px';
    const target=el.querySelector('div')||el;target.appendChild(badge);
  }
}
function unlockElement(el){
  if(el.dataset.mmaGate!=='1')return;
  delete el.dataset.mmaGate;el.removeAttribute('aria-disabled');el.removeAttribute('title');el.style.opacity='';el.querySelector('.mma-lock-badge')?.remove();
}
function decorateGates(){
  document.querySelectorAll('[data-route]').forEach(el=>{
    const feature=routeFeatures[el.dataset.route];if(!feature)return;
    allowed(feature)?unlockElement(el):lockElement(el,feature);
  });
}
function refresh(){updatePlanCards();decorateGates();}

// Capture before app.js navigation handlers.
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-route],[data-action]');if(!el)return;
  const feature=el.dataset.route?routeFeatures[el.dataset.route]:actionFeatures[el.dataset.action];
  if(feature&&!allowed(feature)){
    e.preventDefault();e.stopImmediatePropagation();blockFeature(feature);
  }
},true);

window.addEventListener('hashchange',()=>{
  const route=(location.hash||'').slice(1).split('?')[0];
  const feature=routeFeatures[route];
  if(feature&&!allowed(feature)){
    history.replaceState(null,'',`${location.pathname}${location.search}#billing`);
    notice(`${requiredPlan[feature]} plan required. Choose a plan to unlock this feature.`);
    setTimeout(()=>location.reload(),80);
  }
});

window.MobileMechanicPricingReady=(async()=>{
  await loadCatalog();
  observer=new MutationObserver(refresh);observer.observe(document.documentElement,{childList:true,subtree:true});
  refresh();
  window.MobileMechanicPlanCatalog=catalog;
})();

})();
