(() => {
  'use strict';
  let deferredPrompt=null;
  const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
  function register(){
    if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(err=>console.warn('Service worker registration failed',err));}
  }
  function toast(msg){document.querySelector('.pwa-install-toast')?.remove();const d=document.createElement('div');d.className='toast pwa-install-toast good';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5200);}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;window.MobileMechanicInstallAvailable=true;});
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;window.MobileMechanicInstallAvailable=false;toast('Mobile Mechanic AI added to your home screen.');});
  window.MobileMechanicInstallApp=async()=>{
    if(isStandalone()){toast('Mobile Mechanic AI is already installed.');return true;}
    if(deferredPrompt){deferredPrompt.prompt();const result=await deferredPrompt.userChoice;deferredPrompt=null;return result?.outcome==='accepted';}
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(ios?'On iPhone: tap Share, then Add to Home Screen.':'Open your browser menu and choose Install app or Add to Home screen.');
    return false;
  };
  register();
})();
