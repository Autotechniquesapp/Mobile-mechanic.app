(() => {
'use strict';
const LEVELS={small:.92,standard:1,large:1.16,xlarge:1.32};
const APP_DBKEY='mobile_mechanic_ai_approved_v7';
const CUSTOMER_KEY='mobileMechanicAI_customerTextSize';
const SHOP_KEY_PREFIX='mobileMechanicAI_shopTextSize:';
const GLOBAL_SHOP_KEY='mobileMechanicAI_shopTextSize:default';

function readApp(){try{return JSON.parse(localStorage.getItem(APP_DBKEY)||'{}');}catch{return {};}}
function currentShopId(){return readApp()?.session?.shopId||'';}
function isCustomer(){return !!document.querySelector('.customer-shell');}
function validLevel(v){return Object.prototype.hasOwnProperty.call(LEVELS,v)?v:'standard';}
function shopStorageKey(){const sid=currentShopId();return sid?`${SHOP_KEY_PREFIX}${sid}`:GLOBAL_SHOP_KEY;}
function shopLevel(){return validLevel(localStorage.getItem(shopStorageKey())||localStorage.getItem(GLOBAL_SHOP_KEY)||'standard');}
function customerLevel(){return validLevel(localStorage.getItem(CUSTOMER_KEY)||'standard');}

function ensureStyles(){
  if(document.getElementById('mmaTextSizeStyles'))return;
  const style=document.createElement('style');
  style.id='mmaTextSizeStyles';
  style.textContent=`
    .text-size-control{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0}
    .text-size-control>span{font-weight:800;margin-right:2px}
    .text-size-control button{min-width:44px;min-height:40px;padding:7px 10px;border-radius:10px;border:1px solid #3a414b;background:#171b21;color:inherit;font:inherit;font-weight:800;cursor:pointer}
    .text-size-control button.active{border-color:#ef2a31;box-shadow:0 0 0 2px rgba(239,42,49,.18);background:#241416}
  `;
  document.head.appendChild(style);
}

function apply(){
  ensureStyles();
  const customer=isCustomer();
  const level=customer?customerLevel():shopLevel();
  const scale=LEVELS[level]||1;
  document.documentElement.style.setProperty('--app-text-scale',String(scale));
  if(document.body){
    document.body.style.zoom=String(scale);
    document.body.dataset.textSize=level;
  }
  mount(customer,level);
}

function save(level,customer){
  level=validLevel(level);
  if(customer){
    localStorage.setItem(CUSTOMER_KEY,level);
  }else{
    const key=shopStorageKey();
    localStorage.setItem(key,level);
    if(key===GLOBAL_SHOP_KEY)localStorage.setItem(GLOBAL_SHOP_KEY,level);
  }
  apply();
}

function buttons(level,customer){
  return `<div class="text-size-control" data-text-size-control data-customer="${customer?'true':'false'}" aria-label="Text size"><span>Text size</span>${[['small','A−'],['standard','A'],['large','A+'],['xlarge','A++']].map(([k,label])=>`<button type="button" data-text-level="${k}" class="${level===k?'active':''}" aria-label="${k} text" aria-pressed="${level===k?'true':'false'}">${label}</button>`).join('')}</div>`;
}

function mount(customer,level){
  let existing=document.querySelector('[data-text-size-control]');
  if(existing && existing.dataset.customer!==String(customer)){
    existing.remove();
    existing=null;
  }
  if(existing){
    existing.querySelectorAll('[data-text-level]').forEach(b=>{
      const active=b.dataset.textLevel===level;
      b.classList.toggle('active',active);
      b.setAttribute('aria-pressed',active?'true':'false');
    });
    return;
  }
  if(customer){
    const frame=document.querySelector('.customer-frame');
    if(frame)frame.insertAdjacentHTML('afterbegin',buttons(level,true));
    return;
  }
  const form=document.getElementById('settingsForm');
  if(form&&!form.querySelector('[data-accessibility-section]')){
    const section=document.createElement('section');
    section.className='card card-pad';
    section.dataset.accessibilitySection='true';
    section.style.marginTop='10px';
    section.innerHTML=`<div class="card-title">ACCESSIBILITY</div><div class="section-note">Choose the text size on this device for mechanic screens.</div><div class="divider"></div>${buttons(level,false)}`;
    form.appendChild(section);
  }
}

document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-text-level]');
  if(!b)return;
  e.preventDefault();
  const customer=b.closest('[data-text-size-control]')?.dataset.customer==='true';
  save(b.dataset.textLevel,customer);
});

let queued=false;
new MutationObserver(()=>{
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;apply();});
}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(apply,30));
document.addEventListener('DOMContentLoaded',apply);
setTimeout(apply,250);
})();
