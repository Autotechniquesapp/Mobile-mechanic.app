const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const intake=fs.readFileSync('intake-queue.js','utf8');
const html=fs.readFileSync('index.html','utf8');

function extract(start,end){
  const a=intake.indexOf(start),b=intake.indexOf(end,a);
  assert.ok(a>=0&&b>a,'Missing intake source block: '+start);
  return intake.slice(a,b);
}
const escSource=extract('function esc(v=', '\nfunction cache()');
const mapSource=extract('function intakeAddressMarkup(i={}){', '\nfunction intakeReceivedText(');
const intakeAddressMarkup=vm.runInNewContext(escSource+'\n'+mapSource+'\nintakeAddressMarkup');

function linkUrl(markup){
  const href=markup.match(/href="([^"]+)"/)?.[1];
  assert.ok(href,'Expected clickable address link');
  return new URL(href.replaceAll('&amp;','&'));
}

test('incoming intake address launches Google Maps driving directions',()=>{
  const address='12831 E 37th Way, Yuma, AZ 85367';
  const markup=intakeAddressMarkup({address});
  const url=linkUrl(markup);
  assert.equal(url.origin,'https://www.google.com');
  assert.equal(url.pathname,'/maps/dir/');
  assert.equal(url.searchParams.get('api'),'1');
  assert.equal(url.searchParams.get('destination'),address);
  assert.equal(url.searchParams.get('travelmode'),'driving');
  assert.equal(url.searchParams.get('dir_action'),'navigate');
  assert.match(markup,/target="_blank"/);
  assert.match(markup,/rel="noopener noreferrer"/);
  assert.match(markup,/aria-label="Navigate to/);
});

test('GPS coordinates are used when a submitted address is missing',()=>{
  const markup=intakeAddressMarkup({current_location:{latitude:32.69,longitude:-114.62}});
  assert.equal(linkUrl(markup).searchParams.get('destination'),'32.69,-114.62');
});

test('missing or invalid service locations do not create misleading navigation',()=>{
  assert.equal(intakeAddressMarkup({}),'No service location');
  assert.equal(intakeAddressMarkup({current_location:{lat:1000,lng:0}}),'No service location');
});

test('untrusted intake address is HTML escaped but retained in the encoded map destination',()=>{
  const address='<script>alert("hello")</script> & Main St';
  const markup=intakeAddressMarkup({address});
  assert.doesNotMatch(markup,/<script>/);
  assert.match(markup,/&lt;script&gt;/);
  assert.equal(linkUrl(markup).searchParams.get('destination'),address);
});

test('intake card uses the address directions link and shell cache-busts it',()=>{
  const card=extract('function intakeCard(i){','\nasync function openQueue(){');
  assert.ok(card.includes('<b>Address:</b> '+'$'+'{intakeAddressMarkup(i)}'));
  assert.ok(html.includes('intake-queue.js?v=20261006-phone-alerts1&nav=20261021-address'));
});
