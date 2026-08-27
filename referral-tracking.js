(() => {
'use strict';

const PENDING_KEY='mma_pending_referral_v1';
const sb=window.MobileMechanicSupabase;
if(!sb)return;

function cleanName(v){return String(v||'').trim().replace(/\s+/g,' ').slice(0,120);}
function cleanCode(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32);}
function urlReferral(){return cleanCode(new URLSearchParams(location.search).get('ref'));}
function pending(){try{return JSON.parse(localStorage.getItem(PENDING_KEY))||{};}catch{return {};}}
function savePending(v){localStorage.setItem(PENDING_KEY,JSON.stringify(v));}
function clearPending(){localStorage.removeItem(PENDING_KEY);}

function decorateSignup(){
  const form=document.getElementById('signupForm');
  if(!form||form.dataset.mmaReferral==='1')return;
  form.dataset.mmaReferral='1';
  const emailField=form.querySelector('input[name="email"]')?.closest('.field');
  const wrap=document.createElement('div');
  wrap.className='field';
  wrap.innerHTML=`<label>Referred by / Salesperson <span class="muted">(optional)</span></label><input name="referredBy" maxlength="120" autocomplete="off" placeholder="Name of salesperson or person who referred you"><p class="small muted" style="margin:6px 0 0">This helps us give credit to the person who referred your shop.</p>`;
  if(emailField)emailField.parentNode.insertBefore(wrap,emailField);else form.appendChild(wrap);

  const code=urlReferral();
  if(code){
    const hidden=document.createElement('input');hidden.type='hidden';hidden.name='referralCode';hidden.value=code;form.appendChild(hidden);
    const note=document.createElement('div');note.className='small muted';note.textContent=`Referral code: ${code}`;wrap.appendChild(note);
  }
}

new MutationObserver(decorateSignup).observe(document.documentElement,{childList:true,subtree:true});
decorateSignup();

// Preserve referral attribution inside Auth metadata too, so it can survive email confirmation
// and be attached to the shop after the authenticated account is created.
const originalSignUp=sb.auth.signUp.bind(sb.auth);
sb.auth.signUp=async function(credentials){
  const form=document.getElementById('signupForm');
  const formData=form?Object.fromEntries(new FormData(form)):{};
  const previous=pending();
  const referredBy=cleanName(formData.referredBy||previous.referredBy);
  const referralCode=cleanCode(formData.referralCode||urlReferral()||previous.referralCode);
  if(referredBy||referralCode){
    savePending({referredBy,referralCode,email:String(credentials?.email||formData.email||'').trim().toLowerCase()});
    credentials={...credentials,options:{...(credentials.options||{}),data:{...(credentials.options?.data||{}),referred_by:referredBy||null,referral_code:referralCode||null}}};
  }
  return originalSignUp(credentials);
};

document.addEventListener('submit',e=>{
  if(e.target?.id!=='signupForm')return;
  const d=Object.fromEntries(new FormData(e.target));
  const referredBy=cleanName(d.referredBy),referralCode=cleanCode(d.referralCode||urlReferral());
  if(referredBy||referralCode)savePending({referredBy,referralCode,email:String(d.email||'').trim().toLowerCase()});
},true);

async function attachReferral(user,attempt=0){
  if(!user)return;
  const p=pending();
  const meta=user.user_metadata||{};
  const referredBy=cleanName(p.referredBy||meta.referred_by);
  const referralCode=cleanCode(p.referralCode||meta.referral_code||urlReferral());
  if(!referredBy&&!referralCode)return;

  const {data:memberships,error}=await sb.from('shop_members').select('shop_id').eq('user_id',user.id).eq('status','active').limit(1);
  if(error)return;
  if(!memberships?.length){
    if(attempt<4)setTimeout(()=>attachReferral(user,attempt+1),700*(attempt+1));
    return;
  }
  const sid=memberships[0].shop_id;
  const {data:shop,error:shopError}=await sb.from('shops').select('shop_id,referred_by_name,referral_code').eq('shop_id',sid).single();
  if(shopError||!shop)return;
  if(shop.referred_by_name||shop.referral_code){clearPending();return;}
  const {error:updateError}=await sb.from('shops').update({referred_by_name:referredBy||null,referral_code:referralCode||null}).eq('shop_id',sid);
  if(!updateError)clearPending();
}

sb.auth.onAuthStateChange((_event,session)=>{
  if(session?.user)setTimeout(()=>attachReferral(session.user),250);
});
sb.auth.getSession().then(({data})=>{if(data?.session?.user)attachReferral(data.session.user);});

window.MobileMechanicReferralTracking={decorateSignup};
})();