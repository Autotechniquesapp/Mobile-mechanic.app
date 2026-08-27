(() => {
'use strict';
async function isAdmin(){
  const sb=window.MobileMechanicSupabase;if(!sb)return false;
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session?.user)return false;
    const {data,error}=await sb.from('platform_admins').select('role,active').eq('user_id',session.user.id).maybeSingle();
    return !error&&!!data?.active;
  }catch{return false;}
}
function inject(){
  if(document.querySelector('.mma-platform-admin-link'))return;
  const top=document.querySelector('.topbar');if(!top)return;
  const anchor=document.createElement('a');anchor.href='/admin';anchor.className='btn btn-soft mma-platform-admin-link';anchor.textContent='Platform Admin';anchor.style.whiteSpace='nowrap';
  const shopPill=top.querySelector('.shop-pill');if(shopPill)top.insertBefore(anchor,shopPill);else top.appendChild(anchor);
}
(async()=>{
  if(!(await isAdmin()))return;
  const observer=new MutationObserver(inject);observer.observe(document.documentElement,{childList:true,subtree:true});inject();
})();
})();
