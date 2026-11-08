(() => {
'use strict';
const KEY='mobile_mechanic_ai_approved_v7';
let busy=false;
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}};
function notify(text,type='good'){const el=document.createElement('div');el.className=`toast ${type}`;el.setAttribute('role','status');el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),7000);}
function context(){const db=read(),sid=db.session?.shopId;return {sid,jobId:db.session?.activeJobId};}
async function dictate(button){
 if(busy)return;
 const cap=window.Capacitor;
 if(!cap.isPluginAvailable?.('NativeDictation'))return notify('Install the updated Android app to enable microphone permission and dictation.','bad');
 const target=document.querySelector(button.dataset.action==='voice-findings'?'#findingText,[data-jwt-findings]':'#complaintInput');
 if(!target)return;
 const captured=context(),findings=button.dataset.action==='voice-findings',original=button.innerHTML;
 busy=true;button.disabled=true;button.textContent='Opening Android microphone…';
 try{
  const plugin=cap.Plugins?.NativeDictation||cap.registerPlugin('NativeDictation');
  const result=await plugin.start({language:document.documentElement.lang?.startsWith('es')?'es-US':'en-US'});
  const text=String(result?.text||'').trim();if(result?.cancelled||!text)return;
  const current=context();
  if(!target.isConnected||(findings&&(current.sid!==captured.sid||current.jobId!==captured.jobId)))return;
  target.value=[target.value.trim(),text].filter(Boolean).join(' ');
  target.dispatchEvent(new Event('input',{bubbles:true}));
  if(findings){
   const sb=window.MobileMechanicSupabase;
   if(!sb||!captured.sid||!captured.jobId)throw new Error('Text added. Tap Save Findings to save your notes.');
   const value=target.value;
   const {data,error}=await sb.from('jobs').update({findings:value,updated_at:new Date().toISOString()}).eq('shop_id',captured.sid).eq('id',captured.jobId).select('id').maybeSingle();
   if(error||!data)throw new Error('Text added, but could not save findings. Tap Save Findings to retry.');
   const db=read(),job=db.shops?.[captured.sid]?.jobs?.find(j=>String(j.id)===String(captured.jobId));
   if(job){job.findings=value;localStorage.setItem(KEY,JSON.stringify(db));}
   notify('Dictation added and findings saved.');
  }else notify('Dictation added.');
 }catch(error){notify(error?.message||'Android could not start dictation. Please try again.','bad');}
 finally{busy=false;button.disabled=false;button.innerHTML=original;}
}
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-action="voice-findings"],[data-action="voice-customer"]');
 if(!button||!window.Capacitor?.isNativePlatform?.())return;
 event.preventDefault();event.stopImmediatePropagation();dictate(button);
},true);
})();
