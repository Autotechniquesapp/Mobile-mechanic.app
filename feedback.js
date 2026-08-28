(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';
const sb=window.MobileMechanicSupabase;
let submitting=false;

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const c=cache();const sid=c.session?.shopId;const shop=sid?c.shops?.[sid]:null;return {cache:c,sid,shop,userId:c.session?.userId||null,jobId:c.session?.activeJobId||null,route:(location.hash||'#dashboard').slice(1).split('?')[0]||'dashboard'};}
function toast(msg,type=''){document.querySelector('.feedback-toast')?.remove();const el=document.createElement('div');el.className=`toast feedback-toast ${type}`;el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3600);}
function addStyles(){if(document.getElementById('feedbackStyles'))return;const style=document.createElement('style');style.id='feedbackStyles';style.textContent=`
.feedback-fab{position:fixed;right:16px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:85;border:1px solid #7d3035;background:linear-gradient(180deg,#1a1f26,#11151a);color:#fff;border-radius:999px;padding:10px 14px;display:flex;align-items:center;gap:8px;font-weight:850;box-shadow:0 12px 34px rgba(0,0,0,.42);cursor:pointer}.feedback-fab:hover{border-color:#ef2a31}.feedback-fab-dot{width:9px;height:9px;border-radius:50%;background:#ef2a31;box-shadow:0 0 12px rgba(239,42,49,.7)}
.feedback-modal-backdrop{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.72);display:grid;place-items:end center;padding:18px}.feedback-modal{width:min(620px,100%);background:#0d1116;color:#f6f7f9;border:1px solid #7d3035;border-radius:14px;padding:16px;box-shadow:0 30px 90px rgba(0,0,0,.6)}.feedback-modal h2{margin:0;font-size:20px}.feedback-modal p{color:#9da6b2;margin:5px 0 14px}.feedback-modal label{display:block;font-size:11px;font-weight:800;color:#c6ccd4;margin:10px 0 5px}.feedback-modal select,.feedback-modal textarea{width:100%;background:#080b0f;color:#fff;border:1px solid #343c46;border-radius:9px;padding:11px;font:inherit}.feedback-modal textarea{min-height:130px;resize:vertical}.feedback-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.feedback-actions button{min-height:40px;border-radius:9px;padding:9px 13px;font-weight:850;cursor:pointer}.feedback-cancel{background:#151a21;color:#fff;border:1px solid #343c46}.feedback-submit{background:#d5252c;color:#fff;border:1px solid #ff4b50}.feedback-context{font-size:11px;color:#7f8996;margin-top:8px}
@media(min-width:900px){.feedback-fab{bottom:18px}}
`;document.head.appendChild(style);}
function close(){document.querySelector('.feedback-modal-backdrop')?.remove();}
function open(){
  const {shop,route,jobId}=context();
  if(!shop)return toast('Open your shop workspace before sending feedback.','bad');
  close();
  const wrap=document.createElement('div');wrap.className='feedback-modal-backdrop';
  wrap.innerHTML=`<form class="feedback-modal" id="feedbackForm"><h2>Feedback & Feature Request</h2><p>Tell the Mobile Mechanic AI team what would make the app better or what is not working.</p><label>What kind of feedback?</label><select name="category"><option value="feature_request">Feature I would like added</option><option value="bug_problem">Something is not working</option><option value="general_feedback">General feedback</option></select><label>Tell us about it</label><textarea name="message" maxlength="4000" required placeholder="Example: I would like a button that texts the customer when I am on the way..."></textarea><div class="feedback-context">Shop: ${esc(shop.name||shop.id)} · Page: ${esc(route)}${jobId?` · Current job attached`:''}</div><div class="feedback-actions"><button type="button" class="feedback-cancel" data-feedback-close>Cancel</button><button type="submit" class="feedback-submit">Send Feedback</button></div></form>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('[data-feedback-close]'))close();});
  wrap.querySelector('#feedbackForm').addEventListener('submit',submit);
  setTimeout(()=>wrap.querySelector('textarea')?.focus(),30);
}
async function submit(e){
  e.preventDefault();if(submitting)return;submitting=true;
  const btn=e.currentTarget.querySelector('.feedback-submit');if(btn){btn.disabled=true;btn.textContent='Sending…';}
  try{
    if(!sb)throw new Error('Feedback service is not connected.');
    const {data:{user},error:userError}=await sb.auth.getUser();if(userError||!user)throw new Error('Please sign in again before sending feedback.');
    const {sid,shop,jobId,route}=context();if(!sid||!shop)throw new Error('Shop context is missing.');
    const d=Object.fromEntries(new FormData(e.currentTarget));
    const message=String(d.message||'').trim();if(message.length<3)throw new Error('Please add a little more detail.');
    const payload={shop_id:sid,user_id:user.id,category:d.category,message,route,job_id:jobId||null,metadata:{shop_name:shop.name||null,plan:shop.plan||null,screen:`${window.innerWidth}x${window.innerHeight}`,user_agent:navigator.userAgent}};
    let {error}=await sb.from('feedback_requests').insert(payload);
    if(error&&jobId){delete payload.job_id;payload.metadata.job_id=jobId;({error}=await sb.from('feedback_requests').insert(payload));}
    if(error)throw error;
    close();toast('Thanks — your feedback was sent.','good');
  }catch(err){toast(err.message||'Could not send feedback.','bad');if(btn){btn.disabled=false;btn.textContent='Send Feedback';}}
  finally{submitting=false;}
}
function install(){
  addStyles();
  const {sid}=context();const shell=document.querySelector('.shell');
  if(!shell||!sid){document.querySelector('.feedback-fab')?.remove();return;}
  if(document.querySelector('.feedback-fab'))return;
  const btn=document.createElement('button');btn.type='button';btn.className='feedback-fab';btn.innerHTML='<span class="feedback-fab-dot"></span><span>Feedback</span>';btn.setAttribute('aria-label','Send feedback or request a feature');btn.addEventListener('click',open);document.body.appendChild(btn);
}
new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(install,0));
install();
})();