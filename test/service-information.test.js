const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8'),moduleSource=fs.readFileSync('service-information.js','utf8'),html=fs.readFileSync('index.html','utf8');
test('service information is reachable from dashboard and job',()=>{assert.match(app,/data-route="service-info"/);assert.ok((app.match(/data-route="service-info"/g)||[]).length>=2);assert.match(app,/'service-info':serviceInfo/);});
test('all requested service categories are present',()=>{for(const id of ['procedures','specifications','parts-labor','figures','wiring','tsbs','quick','recalls'])assert.match(moduleSource,new RegExp(`'${id}'`));});
test('official data and provider adapter are wired',()=>{assert.match(moduleSource,/api\.nhtsa\.gov/);assert.match(moduleSource,/registerProvider/);assert.match(html,/service-information\.js/);});
