(() => {
'use strict';

const DBKEY = 'mobile_mechanic_ai_approved_v7';
const TERMS_VERSION = '2026-08-v3';
const PRIVACY_VERSION = '2026-09-v1';
const DATA_USE_VERSION = '2026-09-v1';
const TERMS_SHA256 = '89ce4120351d943e4c00f81aab95202b1a6fa8fbe18692ace9b887d6dcdd1e3a';

function readCache(){
  try{return JSON.parse(localStorage.getItem(DBKEY))||{};}catch{return {};}
}
function writeCache(v){localStorage.setItem(DBKEY,JSON.stringify(v));}
function currentShopId(){const db=readCache();return db.session?.shopId||null;}
function notice(message,type=''){
  document.querySelector('.mma-legal-toast')?.remove();
  const d=document.createElement('div');
  d.className=`toast mma-legal-toast ${type}`;
  d.textContent=message;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),4600);
}

function legalLinks(){
  return `<a href="/terms" target="_blank" rel="noopener">Terms of Use</a>, <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>, and <a href="/data-use" target="_blank" rel="noopener">Data Collection & Use Policy</a>`;
}

function decorateAcceptance(){
  const btn=document.querySelector('[data-action="accept-all"]');
  if(!btn||document.getElementById('mmaLegalAcceptance'))return;
  const wrap=document.createElement('div');
  wrap.id='mmaLegalAcceptance';
  wrap.className='card';
  wrap.style.cssText='margin:14px 0;border:1px solid #ef2a31;padding:14px;border-radius:12px;background:#15090b';
  wrap.innerHTML=`
    <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">
      <input id="mmaLegalAgree" type="checkbox" style="margin-top:4px" />
      <span>I have read and agree to the ${legalLinks()}. Current versions: Terms ${TERMS_VERSION}, Privacy ${PRIVACY_VERSION}, Data Use ${DATA_USE_VERSION}. I understand AI, repair, accounting, and tax outputs are advisory or estimates only, and I remain responsible for my shop's decisions, repairs, taxes, compliance, and customer communications.</span>
    </label>
    <p class="small muted" style="margin:10px 0 0">By checking this box and clicking the acceptance button, you are entering these agreements on behalf of the business account. The accepted document versions and timestamp are recorded with the shop account.</p>`;
  wrap.querySelectorAll('a').forEach(a=>a.style.cssText='color:#ff5a60;text-decoration:underline');
  btn.parentNode?.insertBefore(wrap,btn);
}

function decorateSignupLegal(){
  const form=document.getElementById('signupForm');
  const check=form?.querySelector('input[name="terms"]');
  const main=check?.closest('.list-item')?.querySelector('.list-main');
  if(!main||main.dataset.mmaLegalSignup==='1')return;
  main.dataset.mmaLegalSignup='1';
  main.innerHTML=`<b>Subscription, privacy & platform terms</b><p>I have reviewed the ${legalLinks()}. I understand billing is recurring after the trial when activated, payments are generally non-refundable except where required by law, and AI is an assistive tool only. Formal acceptance versions are recorded when shop setup is completed.</p>`;
  main.querySelectorAll('a').forEach(a=>a.style.cssText='color:#ff5a60;text-decoration:underline');
}

function decorateLandingLegal(){
  const footer=document.querySelector('.hercules-landing footer');
  if(!footer||footer.dataset.mmaLegalFooter==='1')return;
  footer.dataset.mmaLegalFooter='1';
  footer.insertAdjacentHTML('beforeend',`<div style="margin-top:8px;font-size:12px"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/data-use">Data Use</a></div>`);
  footer.querySelectorAll('a').forEach(a=>a.style.cssText='color:#ff6d72;text-decoration:none');
}

function decorateTaxPlanning(){
  document.querySelectorAll('[data-tax-planning],.tax-planning,.tax-estimate').forEach(el=>{
    if(el.dataset.mmaTaxDisclaimer==='1')return;
    el.dataset.mmaTaxDisclaimer='1';
    const box=document.createElement('div');
    box.className='legal-callout';
    box.style.cssText='margin:12px 0;padding:10px 12px;border:1px solid #ef2a31;border-radius:10px;background:#15090b;font-size:12px';
    box.textContent='Tax Planning Estimate — informational planning only. Not tax, accounting, legal, or financial advice. Verify figures and filing obligations with authoritative sources and a qualified professional.';
    el.prepend(box);
  });
}

function decorateLegalUi(){
  decorateAcceptance();
  decorateSignupLegal();
  decorateLandingLegal();
  decorateTaxPlanning();
}

const observer=new MutationObserver(decorateLegalUi);
observer.observe(document.documentElement,{childList:true,subtree:true});

// Register before the production bridge so acceptance is recorded atomically with setup completion.
document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-action="accept-all"]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();

  const agree=document.getElementById('mmaLegalAgree');
  if(!agree?.checked){
    notice('Read the Terms, Privacy Policy, and Data Use Policy and check the agreement box before continuing.','bad');
    return;
  }

  const sb=window.MobileMechanicSupabase;
  const sid=currentShopId();
  if(!sb||!sid){notice('Secure account session is not ready. Please sign in again.','bad');return;}
  btn.disabled=true;
  try{
    const {data:{session},error:sessionError}=await sb.auth.getSession();
    if(sessionError||!session?.user)throw sessionError||new Error('Sign-in session expired.');

    const {error:acceptError}=await sb.from('terms_acceptances').insert({
      user_id:session.user.id,
      shop_id:sid,
      terms_version:TERMS_VERSION,
      document_sha256:TERMS_SHA256,
      privacy_version:PRIVACY_VERSION,
      data_use_version:DATA_USE_VERSION,
      user_agent:String(navigator.userAgent||'').slice(0,500)
    });
    if(acceptError)throw acceptError;

    const acceptedAt=new Date().toISOString();
    const patch={
      setup_complete:true,
      terms_version:TERMS_VERSION,
      terms_accepted_at:acceptedAt,
      privacy_version:PRIVACY_VERSION,
      privacy_accepted_at:acceptedAt,
      data_use_version:DATA_USE_VERSION,
      data_use_accepted_at:acceptedAt
    };
    const name=document.getElementById('setupShopName')?.value?.trim();
    const phone=document.getElementById('setupPhone')?.value?.trim();
    if(name)patch.name=name;
    if(phone)patch.business_phone=phone;
    const {error:updateError}=await sb.from('shops').update(patch).eq('shop_id',sid);
    if(updateError)throw updateError;

    const db=readCache();
    if(db.shops?.[sid]){
      db.shops[sid].setupComplete=true;
      db.shops[sid].terms={
        version:TERMS_VERSION,
        acceptedAt,
        userId:session.user.id,
        privacyVersion:PRIVACY_VERSION,
        dataUseVersion:DATA_USE_VERSION
      };
      writeCache(db);
    }
    location.hash='#dashboard';
    location.reload();
  }catch(err){
    btn.disabled=false;
    notice(err?.message||'Could not record legal acceptance.','bad');
  }
},true);

window.MobileMechanicLegalEnforce=async function(){
  try{
    await (window.MobileMechanicBootstrap||Promise.resolve());
    const db=readCache(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null;
    if(!shop)return;

    let termsVersion=shop.terms?.version||null;
    let privacyVersion=shop.terms?.privacyVersion||null;
    let dataUseVersion=shop.terms?.dataUseVersion||null;
    const sb=window.MobileMechanicSupabase;
    if(sb&&sid){
      const {data,error}=await sb.from('shops').select('terms_version,privacy_version,data_use_version').eq('shop_id',sid).single();
      if(!error&&data){
        termsVersion=data.terms_version||null;
        privacyVersion=data.privacy_version||null;
        dataUseVersion=data.data_use_version||null;
        shop.terms={...(shop.terms||{}),version:termsVersion,privacyVersion,dataUseVersion};
        db.shops[sid]=shop;
        writeCache(db);
      }
    }

    if(termsVersion!==TERMS_VERSION||privacyVersion!==PRIVACY_VERSION||dataUseVersion!==DATA_USE_VERSION){
      shop.setupComplete=false;
      db.shops[sid]=shop;
      writeCache(db);
      if(!['#login','#signup','#setup'].includes(location.hash))location.hash='#setup';
    }
  }finally{
    decorateLegalUi();
  }
};

window.MobileMechanicLegal={
  termsVersion:TERMS_VERSION,
  privacyVersion:PRIVACY_VERSION,
  dataUseVersion:DATA_USE_VERSION,
  termsSha256:TERMS_SHA256
};
})();

// Public customer intake must be intercepted before supabase-production.js registers its
// legacy direct-table handler. This avoids RLS/session collisions and always routes the
// public form through the locked-down submit_public_intake RPC.
(() => {
'use strict';

function intakeNotice(message,type=''){
  document.querySelector('.mma-public-intake-toast')?.remove();
  const d=document.createElement('div');
  d.className=`toast mma-public-intake-toast ${type}`;
  d.textContent=message;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),4600);
}

async function sendPublicIntake(form){
  const sb=window.MobileMechanicSupabase;
  const button=form.querySelector('.customer-submit,[type="submit"]');
  const oldText=button?.textContent||'';
  if(!sb){intakeNotice('Secure intake service is still loading. Try again in a moment.','bad');return;}

  const d=Object.fromEntries(new FormData(form));
  if(button){button.disabled=true;button.textContent='SENDING…';}

  const vehicle={
    year:d.year?Number(d.year):null,
    make:d.make||null,
    model:d.model||null,
    submodel:d.trim||null,
    engine:d.engine||null,
    drivetrain:d.drive||null,
    vin:(d.vin||'').trim().toUpperCase()||null,
    license_plate:(d.plate||'').trim()||null,
    mileage:d.mileage?Number(d.mileage):null,
    request_type:d.requestType||'Repair / Diagnostic'
  };

  try{
    const {error}=await sb.rpc('submit_public_intake',{
      p_shop_id:form.dataset.shop,
      p_customer_name:d.customerName||'',
      p_phone:d.phone||null,
      p_email:d.email||null,
      p_address:d.location||null,
      p_availability:d.availability||null,
      p_current_location:d.location?{raw:d.location}:null,
      p_vehicle:vehicle,
      p_customer_states:d.complaint||''
    });
    if(error)throw error;

    const shopName=document.querySelector('.customer-shop b')?.textContent||'the shop';
    const body=document.querySelector('.customer-body');
    if(body)body.innerHTML=`<div class="customer-card" style="text-align:center"><h2>✓ Request sent to ${shopName}</h2><p>Your request was received.</p><p class="muted small">The shop will review it and contact you with the next step.</p></div>`;
    document.querySelector('.customer-footer')?.remove();
    intakeNotice('Customer intake sent successfully.','good');
  }catch(err){
    if(button){button.disabled=false;button.textContent=oldText||'SEND TO SHOP';}
    intakeNotice(err?.message||'Could not submit intake.','bad');
    console.error('Secure public intake failed',err);
  }
}

document.addEventListener('submit',e=>{
  const form=e.target;
  const isCustomerIntake=form?.id==='intakeForm' && !!form.dataset.shop && !!document.querySelector('.customer-body');
  if(!isCustomerIntake)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  sendPublicIntake(form);
},true);
})();
