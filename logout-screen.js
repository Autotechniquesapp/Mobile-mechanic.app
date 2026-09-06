(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';
let logoutOpen=false;

function readCache(){
  try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}
  catch{return {};}
}
function esc(v=''){
  return String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
}
function currentAccount(){
  const cache=readCache();
  const sid=cache.session?.shopId;
  const shop=sid?cache.shops?.[sid]:null;
  const user=shop?.users?.find(u=>u.id===cache.session?.userId)||null;
  return {cache,shop,user};
}

function showLogoutScreen(){
  const root=document.getElementById('app');
  if(!root)return;
  const {shop,user}=currentAccount();
  logoutOpen=true;
  root.innerHTML=`
    <div class="shell logout-shell">
      <header class="topbar">
        <div class="brand" aria-label="Mobile Mechanic AI">
          <div class="brand-copy">
            <div class="brand-title">MOBILE <span class="red">MECHANIC</span> AI</div>
            <div class="brand-sub">Account</div>
          </div>
        </div>
      </header>
      <div class="layout">
        <main class="content">
          <div class="page-title">
            <button class="back-btn" type="button" data-cancel-logout aria-label="Back">‹</button>
            <div><h2>Log Out</h2><p>End this session on this device.</p></div>
          </div>
          <section class="card card-pad" style="max-width:620px;margin:18px auto 0">
            <div class="card-title">SIGN OUT OF MOBILE MECHANIC AI</div>
            <div class="section-note">${shop?`You are signed in to <b>${esc(shop.name||'this shop')}</b>.`: 'You are signed in to Mobile Mechanic AI.'}</div>
            <div class="divider"></div>
            ${user?`<div class="list-item"><div class="list-main"><b>${esc(user.name||'Shop User')}</b><p>${esc(user.email||'')} ${user.role?`• ${esc(user.role)}`:''}</p></div></div><div class="divider"></div>`:''}
            <p class="muted">Logging out does not delete the shop, jobs, customers, estimates, or settings. It only signs this device out.</p>
            <div class="btn-row" style="margin-top:16px">
              <button class="btn btn-danger btn-wide" type="button" data-confirm-logout>Log Out</button>
              <button class="btn btn-soft btn-wide" type="button" data-cancel-logout>Cancel</button>
            </div>
          </section>
        </main>
      </div>
    </div>`;
}

async function confirmLogout(button){
  if(button){button.disabled=true;button.textContent='Logging Out…';}
  try{
    if(window.MobileMechanicSupabase?.auth){
      await window.MobileMechanicSupabase.auth.signOut();
    }
  }catch(err){
    console.warn('Remote sign-out failed; clearing the local session anyway.',err);
  }
  try{localStorage.removeItem(DBKEY);}catch{}
  logoutOpen=false;
  location.hash='#login';
  location.reload();
}

function cancelLogout(){
  logoutOpen=false;
  location.hash='#more';
  location.reload();
}

function addDrawerLogout(){
  const account=document.querySelector('.drawer-account');
  if(!account||account.querySelector('[data-action="logout"]'))return;
  const button=document.createElement('button');
  button.type='button';
  button.className='btn btn-soft btn-wide';
  button.dataset.action='logout';
  button.style.marginTop='10px';
  button.textContent='Log Out';
  account.appendChild(button);
}

function enhance(){
  if(logoutOpen)return;
  addDrawerLogout();
  document.querySelectorAll('[data-action="logout"]').forEach(button=>{
    if(!button.dataset.logoutLabelFixed){
      button.dataset.logoutLabelFixed='1';
      if(!button.textContent.trim())button.textContent='Log Out';
    }
  });
}

// Register before Supabase and app.js handlers so the user sees a real confirmation screen first.
document.addEventListener('click',e=>{
  const open=e.target.closest?.('[data-action="logout"]');
  if(open){
    e.preventDefault();
    e.stopImmediatePropagation();
    showLogoutScreen();
    return;
  }
  const confirm=e.target.closest?.('[data-confirm-logout]');
  if(confirm){
    e.preventDefault();
    e.stopImmediatePropagation();
    confirmLogout(confirm);
    return;
  }
  const cancel=e.target.closest?.('[data-cancel-logout]');
  if(cancel){
    e.preventDefault();
    e.stopImmediatePropagation();
    cancelLogout();
  }
},true);

new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});
else enhance();

window.MobileMechanicShowLogout=showLogoutScreen;
})();
