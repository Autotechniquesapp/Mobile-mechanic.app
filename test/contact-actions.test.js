const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('contact-actions.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

function fixture(markup) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main id="app">' + markup + '</main></body></html>', {
    url: 'https://www.mobile-mechanic.app/#calendar',
    runScripts: 'outside-only'
  });
  const w = dom.window;
  const opened = [];
  w.open = (...args) => { opened.push(args); return null; };
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7', JSON.stringify({
    session: { shopId: 'shop1' },
    shops: {
      shop1: {
        jobs: [{
          id: 'job1', customerName: 'Customer', phone: '(928) 555-0105',
          location: '123 Main St, Yuma, AZ 85364', status: 'Scheduled'
        }],
        customers: [{ name: 'Customer', phone: '(928) 555-0105', address: '123 Main St, Yuma, AZ 85364' }]
      }
    }
  }));
  w.eval(source);
  return { dom, w, opened, document: w.document };
}

function settle() { return new Promise(resolve => setTimeout(resolve, 190)); }

test('load contact actions on every app route, including scheduler', () => {
  assert.match(html, /src="contact-actions\.js\?v=/);
  assert.match(fs.readFileSync('calendar-live-actions.js', 'utf8'), /j\.phone\?\x60<small>☎/);
});

test('schedule address opens Google Maps navigation instead of parent job', async () => {
  const { dom, document, opened } = fixture(
    '<div role="button" data-cal-open-job="job1" id="appointment">' +
    '<small>123 Main St, Yuma, AZ 85364</small></div>'
  );
  await settle();
  const link = document.querySelector('a[data-mma-contact-kind="address"]');
  assert.ok(link, 'the appointment location is an actual link');
  const url = new URL(link.href);
  assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('destination'), '123 Main St, Yuma, AZ 85364');
  assert.equal(url.searchParams.get('travelmode'), 'driving');
  assert.equal(url.searchParams.get('dir_action'), 'navigate');
  let parentClick = 0;
  document.querySelector('#appointment').addEventListener('click', () => parentClick++);
  link.click();
  assert.equal(opened.length, 1);
  assert.equal(opened[0][0], link.href);
  assert.equal(parentClick, 0, 'the job should not open when opening Maps');
  dom.window.close();
});

test('phone number offers a call or text action without opening the job', async () => {
  const { dom, document } = fixture(
    '<div role="button" data-open-job="job1" id="job">' +
    '<p>Customer: (928) 555-0105</p>' +
    '<small>123 Main St, Yuma, AZ 85364</small></div>'
  );
  await settle();
  let parentClick = 0;
  document.querySelector('#job').addEventListener('click', () => parentClick++);
  const phone = document.querySelector('a[data-mma-contact-kind="phone"]');
  assert.ok(phone);
  phone.click();
  assert.equal(parentClick, 0);
  const picker = document.querySelector('[data-mma-contact-picker]');
  assert.ok(picker);
  assert.equal(picker.querySelector('a[href^="tel:"]').getAttribute('href'), 'tel:9285550105');
  assert.equal(picker.querySelector('a[href^="sms:"]').getAttribute('href'), 'sms:9285550105');
  picker.querySelector('button').click();
  assert.equal(document.querySelector('[data-mma-contact-picker]'), null);
  dom.window.close();
});

test('dynamically rendered customer details are linked, but editable fields are not', async () => {
  const { dom, document } = fixture(
    '<input value="(928) 555-0105"><textarea>123 Main St, Yuma, AZ 85364</textarea>' +
    '<div id="customer"><p>No phone yet</p></div>'
  );
  await settle();
  document.querySelector('#customer').innerHTML =
    '<p>(928) 555-0105</p><table><tr><th>Address</th><td>123 Main St, Yuma, AZ 85364</td></tr></table>';
  await settle();
  assert.ok(document.querySelector('#customer a[data-mma-contact-kind="phone"]'));
  assert.ok(document.querySelector('#customer a[data-mma-contact-kind="address"]'));
  assert.equal(document.querySelector('input').value, '(928) 555-0105');
  assert.equal(document.querySelector('textarea').value, '123 Main St, Yuma, AZ 85364');
  assert.equal(document.querySelectorAll('a[data-mma-contact-kind]').length, 2);
  dom.window.close();
});

test('unknown numbers, placeholders, and unrelated text are not made clickable', async () => {
  const { dom, document } = fixture(
    '<p>Odometer 205000 mi</p><p>No service location</p><p>Not entered</p>'
  );
  await settle();
  assert.equal(document.querySelectorAll('a[data-mma-contact-kind]').length, 0);
  dom.window.close();
});

test('existing numeric call link also opens a choice to call or text', async () => {
  const { dom, document } = fixture(
    '<a href="tel:9285550105">(928) 555-0105</a><a href="tel:9285550105">Call</a>'
  );
  await settle();
  document.querySelector('a[href^="tel:"]').click();
  assert.ok(document.querySelector('[data-mma-contact-picker]'));
  dom.window.close();
});
