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
        <button type="button" class="mma-nav-login" data-mma-scroll="login">Log In</button>
      </div>
    </nav>

    <section class="mma-cardata-hero-grid">
      <div class="mma-cardata-hero-copy">
        <div class="mma-kicker">BUILT FOR MOBILE MECHANICS & REPAIR SHOPS</div>
        <h1>RUN THE JOB.<br><span>NOT THE PAPERWORK.</span></h1>
        <p class="mma-hero-lead">Customer intake, jobs, diagnostics, estimates, approvals, scheduling, parts, and shop tools in one repair workflow built to save time in the bay and on the road.</p>
        <div class="mma-hero-actions">
          <button type="button" class="mma-primary-cta" data-mma-go="signup">START 60-DAY FREE TRIAL</button>
          <button type="button" class="mma-secondary-cta" data-mma-scroll="features">SEE WHAT'S INSIDE</button>
        </div>
        <div class="mma-trust-row">
          <span>✓ No card required for days 1–30</span>
          <span>✓ Mobile-first</span>
          <span>✓ Your shop owns its records</span>
        </div>
      </div>
      <div class="mma-login-slot" data-mma-login-slot></div>
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
      <h2>60 DAYS FREE. THEN PICK THE SHOP SIZE THAT FITS.</h2>
      <p class="mma-section-lead">Days 1–30 require no subscription card. The trial stays free through day 60.</p>
      <div class="mma-price-grid">
        ${plans.map(([name,price,suffix,seats,desc],i)=>`<article class="mma-price-card ${i===1?'featured':''}">${i===1?'<div class="mma-popular">MOST POPULAR</div>':''}<h3>${name}</h3><div class="mma-price"><strong>${price}</strong><span>${suffix}</span></div><b>${seats}</b><p>${desc}</p><button type="button" data-mma-go="signup">START FREE</button></article>`).join('')}
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

function wire(home){
  home.querySelectorAll('[data-mma-go="signup"]').forEach(btn=>btn.addEventListener('click',()=>{ location.hash='#signup'; }));
  home.querySelectorAll('[data-mma-scroll]').forEach(btn=>btn.addEventListener('click',()=>{
    const target=btn.dataset.mmaScroll;
    if(target==='login') home.querySelector('[data-mma-login-slot]')?.scrollIntoView({behavior:'smooth',block:'center'});
    else home.querySelector(`[data-mma-section="${target}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

function mount(){
  const hash=(location.hash||'#login').split('?')[0];
  if(hash!=='#login'){
    document.body.classList.remove('mma-cardata-page');
    return;
  }
  if(document.querySelector('.customer-shell')) return;
  const wrap=document.querySelector('.login-wrap');
  const card=wrap?.querySelector('.login-card');
  if(!wrap||!card||wrap.dataset.cardataMounted==='1') return;

  wrap.dataset.cardataMounted='1';
  document.body.classList.add('mma-cardata-page');
  const holder=document.createElement('div');
  holder.innerHTML=heroMarkup();
  const home=holder.firstElementChild;
  const slot=home.querySelector('[data-mma-login-slot]');
  slot.appendChild(card);
  wrap.replaceChildren(home);
  card.classList.add('mma-cardata-login-card');
  wire(home);
}

new MutationObserver(()=>requestAnimationFrame(mount)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(mount,0));
document.addEventListener('DOMContentLoaded',mount);
mount();
})();
