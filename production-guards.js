(() => {
'use strict';

function notice(message){
  document.querySelector('.production-guard-notice')?.remove();
  const d=document.createElement('div');
  d.className='toast production-guard-notice';
  d.textContent=message;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),4200);
}

document.addEventListener('click',e=>{
  const plan=e.target.closest('[data-plan]');
  if(!plan)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  notice('Stripe billing is not connected yet. No subscription was charged or activated.');
},true);
})();