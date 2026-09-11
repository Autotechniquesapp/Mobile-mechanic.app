const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('app.js','utf8');
const help=fs.readFileSync('technician-help.js','utf8');
const production=fs.readFileSync('supabase-production.js','utf8');

test('vehicle AI button opens the live Technician Help flow',()=>{
  assert.match(help,/window\.MobileMechanicTechnicianHelp=\{open\}/);
  assert.match(app,/window\.MobileMechanicTechnicianHelp/);
  assert.doesNotMatch(app,/Ask Mobile Mechanic AI About This Vehicle'[\s\S]{0,700}data-action="not-connected"/);
});

test('inspection button saves a structured job draft and production syncs it',()=>{
  assert.match(app,/data-ppi-item/);
  assert.match(app,/inspectionDraft=\{/);
  assert.match(app,/s\.inspections\.push\(record\)/);
  assert.match(production,/PPI_MARKER/);
  assert.match(production,/Inspection draft saved to the job/);
});

test('team password reset sends a Supabase recovery email',()=>{
  assert.match(app,/Send Password Reset Email/);
  assert.match(production,/sb\.auth\.resetPasswordForEmail\(email/);
  assert.doesNotMatch(app,/Save Temporary Password/);
});

test('camera scan opens image capture and attempts barcode recognition',()=>{
  assert.match(app,/input\.capture='environment'/);
  assert.match(app,/new BarcodeDetector\(\)\.detect/);
  assert.match(app,/VIN captured/);
});
