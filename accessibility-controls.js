(() => {
'use strict';
const LEVELS={small:.92,standard:1,large:1.16,xlarge:1.32};
const DBKEY='mobileMechanicAI_db_v1';
function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function write(db){localStorage.setItem(DBKEY,JSON.stringify(db));}
function isCustomer(){return !!document.querySelector('.customer-shell');}
function shopLevel(){const db=read(),sid=db.session?.shopId;return db.shops?.[sid]?.settings?.textSize||'standard';}
function customerLevel(){return localStorage.getItem('mobileMechanicAI_customerTextSize')||'standard';}
function apply(){const customer=isCustomer(),level=customer?customerLevel():shopLevel(),scale=LEVELS[level]||1;document.documentElement.style.setProperty('--app-text-scale',scale);document.body.style.zoom=String(scale);document.body.dataset.textSize=level;mount(customer,level);}
function save(level,customer){if(!LEVELS[level])return;if(customer)localStorage.setItem('mobileMechanicAI_customerTextSize',level);else{const db=read(),sid=db.session?.shopId;if(sid&&db.shops?.[sid]){db.shops[sid].settings=db.shops[sid].settings||{};db.shops[sid].settings.textSize=level;write(db);}}apply();}
function buttons(level,customer){return `<div class="text-size-control" data-text-size-control data-customer="${customer?'true':'false'}" aria-label="Text size"><span>Text size</span>${[['small','A−'],['standard','A'],['large','A+'],['xlarge','A++']].map(([k,label])=>`<button type="button" data-text-level="${k}" class="${level===k?'active':''}" aria-label="${k} text">${label}</button>`).join('')}</div>`;}
function mount(customer,level){const existing=document.querySelector('[data-text-size-control]');if(existing){existing.querySelectorAll('[data-text-level]').forEach(b=>b.classList.toggle('active',b.dataset.textLevel===level));return;}if(customer){const frame=document.querySelector('.customer-frame');if(frame)frame.insertAdjacentHTML('afterbegin',buttons(level,true));return;}const form=document.getElementById('settingsForm');if(form&&!form.querySelector('[data-accessibility-section]')){const section=document.createElement('section');section.className='card card-pad';section.dataset.accessibilitySection='true';section.style.marginTop='10px';section.innerHTML=`<div class="card-title">ACCESSIBILITY</div><div class="section-note">Choose the default text size for this shop's mechanic screens.</div><div class="divider"></div>${buttons(level,false)}`;form.appendChild(section);}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-text-level]');if(!b)return;const customer=b.closest('[data-text-size-control]')?.dataset.customer==='true';save(b.dataset.textLevel,customer);});
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',apply);setTimeout(apply,500);
})();
