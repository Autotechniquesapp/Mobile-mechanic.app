const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('customer-intake-i18n.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const production=fs.readFileSync('supabase-production.js','utf8');

test('customer intake loads a persistent English and Spanish selector',()=>{
  assert.match(index,/customer-intake-i18n\.js/);
  assert.match(source,/data-intake-lang="en"/);
  assert.match(source,/data-intake-lang="es"/);
  assert.match(source,/mobile_mechanic_intake_language/);
});

test('Spanish intake covers the complete customer workflow',()=>{
  for(const phrase of ['Sus datos','¿Qué necesita?','Su vehículo','Problema del vehículo','Inspección precompra','Usar ubicación actual','Escanear con cámara','ENVIAR A'])assert.match(source,new RegExp(phrase.replace(/[?¿]/g,'.')));
  assert.match(production,/Solicitud enviada a/);
  assert.match(production,/Recibimos su solicitud/);
});

test('switching languages does not rebuild the form or alter field values',()=>{
  assert.doesNotMatch(source,/location\.reload|innerHTML\s*=\s*ROOT|\.reset\(/);
  assert.match(source,/form\.dataset\.lang/);
});
