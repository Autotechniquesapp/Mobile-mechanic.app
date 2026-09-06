(() => {
'use strict';

function notice(message){
  document.querySelector('.mma-agreement-toast')?.remove();
  const d=document.createElement('div');
  d.className='toast mma-agreement-toast bad';
  d.textContent=message;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),4600);
}

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-action="accept-all"]');
  if(!btn)return;
  const checks=[...document.querySelectorAll('.agreement-check')];
  if(!checks.length)return;
  const missing=checks.find(c=>!c.checked);
  if(!missing)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  notice('Review and check each professional responsibility and legal acknowledgement before continuing.');
  missing.closest('label')?.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>missing.focus(),250);
},true);
})();
