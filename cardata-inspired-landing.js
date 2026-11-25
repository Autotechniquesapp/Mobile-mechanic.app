(() => {
'use strict';

const modules = [
  ['01','Customer Intake','Branded customer intake links that send vehicle concerns directly to the shop.'],
  ['02','Jobs & Findings','Keep complaints, technician findings, codes, photos, and repair progress together.'],
  ['03','Estimates & Approvals','Build repair estimates and collect customer authorization without chasing paperwork.'],
  ['04','Scheduling','See upcoming work, technician availability, and job timing from one place.'],
  ['05','Parts & Labor','Organize parts sourcing, markup, labor guidance, and quote details inside the job workflow.'],
  ['06','Service Information','Search repair resources, recalls, TSBs, procedures, specs, and diagnostic references as sources are connected.'],
  ['07','Payments & Invoices','Keep shop subscription billing separate from customer repair payments and invoices.'],
  ['08','Shop Integrations','Connect the services your repair business uses without turning the app into another bloated CRM.']
];

const plans = [
  ['SOLO','$29.99','/ month','1 user','Independent mobile mechanic'],
  ['SHOP','$69.99','/ month','Up to 5 users','Small repair shop or mobile team'],
  ['PRO / FLEET','$129.99','/ month','Up to 15 users','Larger shops and fleet operations']
];

function heroMarkup(){
  return `<main class="mma-cardata-home">
    <nav class="mma-public-nav">
      <a class="mma-public-brand" href="/#login" aria-label="Mobile Mechanic AI home">
        <span class="mma-brand-mark">MM</span><span>MOBILE <b>MECHANIC</b> AI</span>
      </a>
      <div class="mma-public-nav-actions">
        <button type="button" class="mma-nav-link" data-mma-scroll="features">Features</button>
        <button type="button" class="mma-nav-link" data-mma-scroll="pricing">Pricing</button>
        <button type="button" class="mma-nav-login" data-mma-login>Log In</button>
      </div>
    </nav>

    <section class="mma-cardata-hero-grid">
      <div class="mma-cardata-hero-copy">
        <div class="mma-kicker">FOR MOBILE MECHANICS AND REPAIR SHOPS</div>
        <h1>From the first call<br><span>to the final invoice.</span></h1>
        <p class="mma-hero-lead">Mobile Mechanic AI keeps the customer’s complaint, vehicle, appointment, estimate and invoice together. Open the job on your phone, record what you found, and send it to the customer for approval.</p>
        <div class="mma-hero-actions"><button type="button" class="mma-primary-cta" data-mma-go="signup">CREATE SHOP ACCOUNT</button><a class="mma-secondary-cta" href="/shops/">Try it on one repair</a></div>
      </div>
      <aside class="mma-product-preview" aria-labelledby="findShopHeading">
        <h2 id="findShopHeading">Which shop sent you?</h2>
        <p>Looking for your customer intake form? Enter the business name your mechanic gave you.</p>
        <form id="shopFinder"><label for="shopQuery">Shop name</label><input id="shopQuery" name="shop" type="search" minlength="2" maxlength="100" required placeholder="e.g. AutoTechniques" style="display:block;width:100%;box-sizing:border-box;padding:12px;margin:8px 0;color:#14171a;background:white;border-radius:6px"><button class="mma-primary-cta" type="submit">Find my intake form</button></form>
        <p role="status" id="shopStatus"></p><ul id="shopResults"></ul>
      </aside>
    </section>

    <section class="mma-proof-strip">
      <span>WORK SMARTER.</span><span>FIX FASTER.</span><span>GET PAID.</span>
    </section>

    <section class="mma-marketing-section" id="mmaFeatures" data-mma-section="features">
      <div class="mma-section-eyebrow">WHAT'S INSIDE</div>
      <h2>THE REPAIR WORKFLOW, WITHOUT THE CLUTTER.</h2>
      <p class="mma-section-lead">The important shop tools stay close to the job instead of being scattered across six apps, three browser tabs, and whichever clipboard disappeared this morning.</p>
      <div class="mma-module-grid">
        ${modules.map(([n,title,body])=>`<article class="mma-module-card"><span>${n}</span><h3>${title}</h3><p>${body}</p></article>`).join('')}
      </div>
    </section>

    <section class="mma-marketing-section mma-workflow-section">
      <div class="mma-section-eyebrow">FROM CUSTOMER TO PAID JOB</div>
      <h2>ONE FLOW. LESS RE-TYPING.</h2>
      <div class="mma-workflow-row">
        <div><b>1</b><span>Customer sends intake</span></div>
        <i>›</i><div><b>2</b><span>Shop reviews & diagnoses</span></div>
        <i>›</i><div><b>3</b><span>Estimate & approval</span></div>
        <i>›</i><div><b>4</b><span>Repair, invoice, follow-up</span></div>
      </div>
    </section>

    <section class="mma-marketing-section" id="mmaPricing" data-mma-section="pricing">
      <div class="mma-section-eyebrow">SIMPLE PRICING</div>
      <h2>CHOOSE THE PLAN THAT FITS YOUR SHOP.</h2>
      <p class="mma-section-lead">Compare monthly plans for solo mechanics, repair teams, and fleet operations.</p>
      <div class="mma-price-grid">
        ${plans.map(([name,price,suffix,seats,desc],i)=>`<article class="mma-price-card ${i===1?'featured':''}">${i===1?'<div class="mma-popular">MOST POPULAR</div>':''}<h3>${name}</h3><div class="mma-price"><strong>${price}</strong><span>${suffix}</span></div><b>${seats}</b><p>${desc}</p><button type="button" data-mma-go="signup">GET STARTED</button></article>`).join('')}
      </div>
    </section>

    <section class="mma-final-cta">
      <div><span>READY TO STOP RUNNING THE SHOP FROM TEXTS, NOTES, AND MEMORY?</span><h2>PUT THE WORK IN ONE PLACE.</h2></div>
      <button type="button" data-mma-go="signup">CREATE SHOP ACCOUNT</button>
    </section>

    <footer class="mma-public-footer">
      <span>© ${new Date().getFullYear()} Mobile Mechanic AI</span>
      <span><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/data-use">Data Use</a></span>
    </footer>
  </main>`;
}

function openLogin(overlay){
  if(!overlay)return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden','false');
  setTimeout(()=>overlay.querySelector('#loginEmail')?.focus(),50);
}
function closeLogin(overlay){
  if(!overlay)return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden','true');
}

function wire(home,overlay){
  home.querySelectorAll('[data-mma-go="signup"]').forEach(btn=>btn.addEventListener('click',()=>{ location.hash='#signup'; }));
  home.querySelectorAll('[data-mma-login]').forEach(btn=>btn.addEventListener('click',()=>openLogin(overlay)));
  home.querySelectorAll('[data-mma-scroll]').forEach(btn=>btn.addEventListener('click',()=>{
    home.querySelector(`[data-mma-section="${btn.dataset.mmaScroll}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  const finder=home.querySelector('#shopFinder');
  const status=home.querySelector('#shopStatus');
  const results=home.querySelector('#shopResults');
  let searchVersion=0;
  finder.addEventListener('input',()=>{ searchVersion++; results.replaceChildren(); status.textContent=''; });
  finder.addEventListener('submit',async event=>{
    event.preventDefault();
    const version=++searchVersion;
    results.replaceChildren();
    const term=finder.elements.shop.value.trim().replace(/[%_\\]/g,'');
    if(term.length<2){status.textContent='Enter at least two letters of the shop name.';return;}
    status.textContent='Finding shops…';
    try {
      const {data,error}=await window.MobileMechanicSupabase.from('shops').select('name,slug,service_area').ilike('name','%'+term+'%').order('name').limit(10);
      if(version!==searchVersion)return;
      if(error)throw error;
      for(const shop of data||[]){
        if(!shop.slug)continue;
        const link=document.createElement('a');
        link.href='/intake/'+encodeURIComponent(shop.slug);
        link.textContent=shop.name+(shop.service_area?' — '+shop.service_area:'');
        link.style.color='inherit';
        const item=document.createElement('li');item.append(link);results.append(item);
      }
      status.textContent=results.children.length?'Choose your shop to open its intake form.':'No match. Try a shorter name or ask your mechanic to resend the link.';
    } catch {if(version===searchVersion)status.textContent='Shop search is unavailable. Try again or ask your mechanic to resend the link.';}
  });
  if(new URLSearchParams(location.search).has('findShop')) finder.elements.shop.focus();
  overlay?.querySelector('.landing-close')?.addEventListener('click',()=>closeLogin(overlay));
  overlay?.addEventListener('click',e=>{if(e.target===overlay)closeLogin(overlay);});
}

function mount(){
  const hash=(location.hash||'#login').split('?')[0];
  if(hash!=='#login'){
    document.body.classList.remove('mma-cardata-page');
    return;
  }
  if(document.querySelector('.customer-shell'))return;

  const landing=document.querySelector('.hercules-landing');
  const overlay=landing?.querySelector('.landing-login');
  if(!landing||!overlay||landing.dataset.cardataMounted==='1')return;

  landing.dataset.cardataMounted='1';
  landing.classList.add('mma-cardata-mounted');
  document.body.classList.add('mma-cardata-page');

  const holder=document.createElement('div');
  holder.innerHTML=heroMarkup();
  const home=holder.firstElementChild;
  landing.replaceChildren(home,overlay);
  wire(home,overlay);
}

new MutationObserver(()=>requestAnimationFrame(mount)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(mount,0));
document.addEventListener('DOMContentLoaded',mount);
mount();
})();
