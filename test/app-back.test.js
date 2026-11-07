const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
function browser(hash = '#dashboard') {
  const dom = new JSDOM('<body></body>', {url: 'https://mobile-mechanic.app/' + hash, runScripts: 'outside-only'});
  dom.window.localStorage.setItem('mobile_mechanic_ai_approved_v7', JSON.stringify({session: {role: 'shop', shopId: 'shop', userId: 'owner'}}));
  dom.window.eval(fs.readFileSync('app-back.js', 'utf8'));
  return dom;
}
async function navigate(w, hash) {
  await new Promise(resolve => {w.addEventListener('hashchange', resolve, {once: true}); w.location.hash = hash;});
}
test('Back returns through app screens and stays at dashboard', async () => {
  const dom = browser(), w = dom.window;
  await navigate(w, '#customers'); await navigate(w, '#workup');
  await w.MobileMechanicBack(); assert.equal(w.location.hash, '#customers');
  await w.MobileMechanicBack(); assert.equal(w.location.hash, '#dashboard');
  await w.MobileMechanicBack(); assert.equal(w.location.hash, '#dashboard');
  w.close();
});
test('Back closes the top invoice/customer dialog before changing screens', async () => {
  const dom = browser('#customers'), w = dom.window;
  w.document.body.innerHTML = '<div class="modal-backdrop"><button data-record-close>Close</button></div>';
  let closed = false;
  w.document.querySelector('button').onclick = () => {closed = true; w.document.querySelector('.modal-backdrop').remove();};
  await w.MobileMechanicBack(); assert.equal(closed, true); assert.equal(w.location.hash, '#customers');
  w.close();
});
test('Back closes navigation drawer before leaving a screen', async () => {
  const dom = browser('#customers'), w = dom.window;
  w.document.body.classList.add('drawer-open'); w.document.body.innerHTML = '<button data-action="close-menu">Close</button>';
  w.document.querySelector('button').onclick = () => w.document.body.classList.remove('drawer-open');
  await w.MobileMechanicBack(); assert.equal(w.document.body.classList.contains('drawer-open'), false); assert.equal(w.location.hash, '#customers');
  w.close();
});
test('Back saves invoice edits and stays put when saving fails', async () => {
  const dom = browser('#workup'), w = dom.window;
  w.MobileMechanicInvoiceEditor = {flushSave: async () => {throw new Error('Save failed');}};
  await w.MobileMechanicBack(); assert.equal(w.location.hash, '#workup'); assert.match(w.document.querySelector('.toast').textContent, /Save failed/);
  w.MobileMechanicInvoiceEditor.flushSave = async () => {};
  await w.MobileMechanicBack(); assert.equal(w.location.hash, '#jobs');
  w.close();
});
test('Back cannot return into a previous account after switching shops', async () => {
  const dom = browser(), w = dom.window; await navigate(w, '#customers');
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7', JSON.stringify({session: {role:'shop', shopId:'other', userId:'owner'}}));
  await w.MobileMechanicBack(); assert.equal(w.location.hash, '#dashboard'); w.close();
});
