const has = (name: string) => Boolean(Deno.env.get(name));
const readiness = {
  openai: has('OPENAI_API_KEY'),
  google: has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET'),
  microsoft: has('MICROSOFT_CLIENT_ID') && has('MICROSOFT_CLIENT_SECRET'),
  quickbooks: (has('QUICKBOOKS_CLIENT_ID') || has('INTUIT_CLIENT_ID')) && (has('QUICKBOOKS_CLIENT_SECRET') || has('INTUIT_CLIENT_SECRET')),
  xero: has('XERO_CLIENT_ID') && has('XERO_CLIENT_SECRET'),
  dropbox: (has('DROPBOX_CLIENT_ID') || has('DROPBOX_APP_KEY')) && (has('DROPBOX_CLIENT_SECRET') || has('DROPBOX_APP_SECRET')),
  twilio: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && (has('TWILIO_FROM_NUMBER') || has('TWILIO_MESSAGING_SERVICE_SID')),
  square: has('SQUARE_APPLICATION_ID') && has('SQUARE_APPLICATION_SECRET'),
  paypal: has('PAYPAL_CLIENT_ID') && has('PAYPAL_CLIENT_SECRET') && has('PAYPAL_PARTNER_ID'),
  paypal_bn_code: has('PAYPAL_BN_CODE'),
  paypal_environment: Deno.env.get('PAYPAL_ENVIRONMENT') || 'sandbox',
  openstreetmap: true,
  google_maps: has('GOOGLE_MAPS_API_KEY'),
  carfax: has('CARFAX_API_KEY') || has('CARFAX_CLIENT_ID'),
  parts_suppliers: has('PARTS_SUPPLIER_API_KEY'),
  automation: has('ZAPIER_WEBHOOK_URL') || has('MAKE_WEBHOOK_URL')
};

console.log('integration-health readiness', readiness);

Deno.serve(() => new Response(JSON.stringify(readiness), {
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  }
}));
