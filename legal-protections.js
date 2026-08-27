(() => {
'use strict';

const DBKEY = 'mobile_mechanic_ai_approved_v7';
const TERMS_VERSION = '2026-08-v2';
const TERMS_SHA256 = '9e8de91fbd8e98299d5bd788030952790e5c3a03736e254f9a15f9686a64e457';

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
      <span>I have read and agree to the <a href="/terms" target="_blank" rel="noopener" style="color:#ff5a60;text-decoration:underline">Mobile Mechanic AI Terms of Use</a> (version ${TERMS_VERSION}). I understand AI, repair, accounting, and tax outputs are advisory/estimates only, and I remain responsible for my shop's decisions, repairs, taxes, compliance, and customer communications.</span>
    </label>
    <p class="small muted" style="margin:10px 0 0">By checking this box and clicking the acceptance button, you are entering a binding agreement on behalf of the business account.</p>`;
  btn.parentNode?.insertBefore(wrap,btn);
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

const observer=new MutationObserver(()=>{decorateAcceptance();decorateTaxPlanning();});
observer.observe(document.documentElement,{childList:true,subtree:true});

// Register before the production bridge so acceptance is recorded atomically with setup completion.
document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-action="accept-all"]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();

  const agree=document.getElementById('mmaLegalAgree');
  if(!agree?.checked){
    notice('Read the Terms of Use and check the agreement box before continuing.','bad');
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
      user_agent:String(navigator.userAgent||'').slice(0,500)
    });
    if(acceptError)throw acceptError;

    const patch={
      setup_complete:true,
      terms_version:TERMS_VERSION,
      terms_accepted_at:new Date().toISOString()
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
      db.shops[sid].terms={version:TERMS_VERSION,acceptedAt:patch.terms_accepted_at,userId:session.user.id};
      writeCache(db);
    }
    location.hash='#dashboard';
    location.reload();
  }catch(err){
    btn.disabled=false;
    notice(err?.message||'Could not record Terms acceptance.','bad');
  }
},true);

window.MobileMechanicLegalEnforce=async function(){
  try{
    await (window.MobileMechanicBootstrap||Promise.resolve());
    const db=readCache(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null;
    if(!shop)return;
    if(shop.terms?.version!==TERMS_VERSION){
      shop.setupComplete=false;
      db.shops[sid]=shop;
      writeCache(db);
      if(!['#login','#signup','#setup'].includes(location.hash))location.hash='#setup';
    }
  }finally{
    decorateAcceptance();
    decorateTaxPlanning();
  }
};

window.MobileMechanicLegal={version:TERMS_VERSION,sha256:TERMS_SHA256};
})();