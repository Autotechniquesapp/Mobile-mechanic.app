const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const editor = fs.readFileSync('next-invoice.js', 'utf8');
const square = fs.readFileSync('supabase/functions/square-invoice/index.ts', 'utf8');
const workflow = fs.readFileSync('job-workflow-tools.js', 'utf8');
const workOrder = fs.readFileSync('job-work-order.js', 'utf8');

// Exercise the actual invoice calculation functions without connecting to a user's shop.
function calculator(input) {
  const start = editor.indexOf('function recalc(');
  const end = editor.indexOf('function financialsLocked(');
  assert.ok(start >= 0 && end > start);
  const sandbox = { state: structuredClone(input), roundMoney: value => Math.round((Number(value) || 0) * 100) / 100, shopRate: () => 100 };
  vm.createContext(sandbox);
  vm.runInContext(editor.slice(start, end) + ';globalThis.invoiceMath={recalc,partsTotal,laborTotal,taxTotal,travelTotal,subtotal,estimateTotal,chosenDeposit,validDeposit};', sandbox);
  return sandbox;
}
const ram = () => ({
  parts: [], labor: [{name:'Rear parking brake adjustment (mobile service included)',flat_fee:true,amount:350}],
  tax_rate:8.4,tax_enabled:true,travel_fee:0,travel_enabled:false,
  deposit_mode:'none',deposit_amount:null,deposit_percent:null
});

test('Ram flat service invoice totals $350 plus 8.4% tax without re-adding travel', () => {
  const {invoiceMath: calc} = calculator(ram());
  assert.equal(calc.subtotal(),350);
  assert.equal(calc.taxTotal(),29.40);
  assert.equal(calc.estimateTotal(),379.40);
  assert.equal(calc.chosenDeposit(),0);
  assert.equal(calc.validDeposit(),0);
});

test('per-job tax and travel switches recalculate without changing the shop settings', () => {
  const state = ram();
  state.tax_enabled=false;
  state.travel_enabled=true;
  state.travel_fee=25;
  const {invoiceMath: calc} = calculator(state);
  assert.equal(calc.taxTotal(),0);
  assert.equal(calc.travelTotal(),25);
  assert.equal(calc.estimateTotal(),375);
});

test('fixed and percent deposits are optional, capped by invoice total, and show a remainder', () => {
  const fixed=ram();fixed.deposit_mode='fixed';fixed.deposit_amount=50;
  const f=calculator(fixed).invoiceMath;
  assert.equal(f.validDeposit(),50);
  assert.equal(f.estimateTotal()-f.chosenDeposit(),329.4);
  const pct=ram();pct.deposit_mode='percent';pct.deposit_percent=20;
  const p=calculator(pct).invoiceMath;
  assert.equal(p.validDeposit(),75.88);
  const excessive=ram();excessive.deposit_mode='fixed';excessive.deposit_amount=379.40;
  assert.throws(()=>calculator(excessive).invoiceMath.validDeposit(),/less than the total/);
});

test('editing a flat-fee line does not turn it into hourly labor', () => {
  const {invoiceMath: calc,state}=calculator(ram());
  calc.recalc(state.labor[0]);
  assert.equal(state.labor[0].amount,350);
});

test('billing inputs are editable and invoices persist amounts with tax and travel', () => {
  for(const input of ['data-nxe-name','data-nxe-unit-price','data-nxe-quantity','data-nxe-rate','data-nxe-hours','data-nxe-flat-amount','data-nxe-tax-enabled','data-nxe-tax-rate','data-nxe-travel-enabled','data-nxe-travel-fee','data-nxe-deposit-mode','data-nxe-deposit-amount']){
    assert.ok(editor.includes(input), input);
  }
  assert.match(editor,/subtotal:subtotal\(\),tax:taxTotal\(\),total/);
  assert.match(editor,/Save Invoice Draft/);
  assert.match(editor,/canManagePayments\(\)/);
  assert.match(workflow,/\[data-job-paperwork\]/);
  assert.match(editor,/data-invoice-print/);
  assert.match(editor,/data-invoice-sign/);
  assert.match(editor,/data-nxe-total="grand"/);
  assert.match(workOrder,/data-jwo-section="\$\{type\}"/);
});

test('Square can create either one full-balance payment request or a split deposit', () => {
  assert.match(square,/depositCents > 0 \? \[\{/);
  assert.match(square,/depositCents > 0 \? balanceDays : 0/);
  assert.match(square,/request_type: "BALANCE"/);
  assert.match(square,/request_type: "DEPOSIT"/);
  assert.match(square,/delivery_method: "SHARE_MANUALLY"/);
});
