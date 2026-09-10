import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const API_VERSION = "2026-08-19";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
type Row = Record<string, any>;

function envKey(jsonName: string, legacyName: string) {
  try {
    const parsed = JSON.parse(Deno.env.get(jsonName) || "{}");
    if (parsed?.default) return String(parsed.default);
  } catch { /* legacy secret below */ }
  return Deno.env.get(legacyName) || "";
}
function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}
function dollars(value: Row | null | undefined) {
  return Math.max(0, Number(value?.amount || 0) / 100);
}
function splitName(value: unknown) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return { given_name: parts[0] || "Customer", family_name: parts.slice(1).join(" ") || undefined };
}
function dueDate(days = 7) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Math.max(0, days));
  return date.toISOString().slice(0, 10);
}
function localStatus(squareStatus: unknown) {
  const status = String(squareStatus || "DRAFT").toUpperCase();
  if (status === "DRAFT") return "draft";
  if (status === "PAID") return "paid";
  if (status === "PARTIALLY_PAID") return "partially_paid";
  if (status === "CANCELED" || status === "CANCELLED") return "void";
  return "sent";
}
function invoiceAmounts(square: Row, fallbackTotal = 0) {
  const requests = Array.isArray(square.payment_requests) ? square.payment_requests : [];
  const computed = requests.reduce((sum: number, request: Row) => sum + dollars(request.computed_amount_money), 0);
  const paid = requests.reduce((sum: number, request: Row) => sum + dollars(request.total_completed_amount_money), 0);
  const total = computed || Number(fallbackTotal || 0);
  const unpaidRequest = requests.find((request: Row) => dollars(request.total_completed_amount_money) < dollars(request.computed_amount_money));
  return {
    total,
    paid,
    balance: Math.max(0, total - paid),
    currency: String(requests[0]?.computed_amount_money?.currency || "USD"),
    dueDate: unpaidRequest?.due_date || requests[0]?.due_date || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let admin: any = null;
  let localInvoice: Row | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const service = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const auth = req.headers.get("Authorization") || "";
    if (!supabaseUrl || !publishable || !service) throw new Error("Supabase function secrets are unavailable.");
    const userClient = createClient(supabaseUrl, publishable, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "create_draft");
    const invoiceId = String(body.invoice_id || "");
    if (!invoiceId) return json({ error: "invoice_id is required." }, 400);
    const { data: invoice, error: invoiceError } = await admin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) return json({ error: "Invoice not found." }, 404);
    const { data: membership, error: membershipError } = await admin.from("shop_members")
      .select("shop_id,role,status").eq("user_id", user.id).eq("shop_id", invoice.shop_id)
      .eq("status", "active").maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: "Invoice not found." }, 404);
    if (!["shop_owner", "owner", "manager", "service_writer"].includes(String(membership.role))) {
      return json({ error: "Your shop role cannot manage customer invoices." }, 403);
    }
    localInvoice = invoice;

    const [{ data: processor, error: processorError }, { data: credential, error: credentialError }] = await Promise.all([
      admin.from("shop_payment_processors").select("*").eq("shop_id", membership.shop_id).eq("provider", "square").maybeSingle(),
      admin.from("payment_processor_credentials").select("*").eq("shop_id", membership.shop_id).eq("provider", "square").maybeSingle(),
    ]);
    if (processorError) throw processorError;
    if (credentialError) throw credentialError;
    if (!processor || processor.status !== "connected") return json({ error: "Square is not connected for this shop." }, 409);
    if (!credential?.access_token || !credential?.location_id) return json({ error: "Reconnect Square in Payment Processing." }, 409);

    const environment = String(credential.credential_metadata?.environment || Deno.env.get("SQUARE_ENVIRONMENT") || "production").toLowerCase();
    const api = environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
    const oauth = environment === "sandbox" ? "https://connect.squareupsandbox.com/oauth2" : "https://connect.squareup.com/oauth2";
    const dashboardWebUrl = environment === "sandbox" ? "https://squareupsandbox.com/dashboard" : "https://squareup.com/dashboard/sales/invoices";
    const squareInvoicesAppUrl = environment === "sandbox" ? dashboardWebUrl
      : "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.squareup.invoicesapp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.squareup.invoicesapp;end";
    let token = String(credential.access_token);
    if (credential.refresh_token && credential.token_expires_at
        && new Date(credential.token_expires_at).getTime() < Date.now() + 48 * 3600 * 1000) {
      const appId = Deno.env.get("SQUARE_APPLICATION_ID") || "";
      const appSecret = Deno.env.get("SQUARE_APPLICATION_SECRET") || "";
      if (!appId || !appSecret) return json({ error: "Square application credentials are missing." }, 503);
      const response = await fetch(`${oauth}/token`, {
        method: "POST",
        headers: { "Square-Version": API_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "refresh_token",
          refresh_token: credential.refresh_token,
        }),
      });
      const refreshed = await response.json().catch(() => ({}));
      if (!response.ok || !refreshed.access_token) throw new Error(refreshed?.errors?.[0]?.detail || "Square token refresh failed.");
      token = String(refreshed.access_token);
      const { error } = await admin.from("payment_processor_credentials").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || credential.refresh_token,
        token_expires_at: refreshed.expires_at || null,
        updated_at: new Date().toISOString(),
      }).eq("id", credential.id);
      if (error) throw error;
    }
    const headers = { Authorization: `Bearer ${token}`, "Square-Version": API_VERSION, "Content-Type": "application/json" };
    const squareRequest = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${api}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.errors?.[0]?.detail || data?.errors?.[0]?.code || `Square request failed (${response.status}).`);
      return data;
    };
    const saveMapping = async (entityType: string, localId: string, externalId: string, syncToken: unknown, metadata: Row = {}) => {
      const now = new Date().toISOString();
      const { error } = await admin.from("integration_entity_mappings").upsert({
        shop_id: membership.shop_id,
        provider: "square",
        entity_type: entityType,
        local_id: localId,
        external_id: externalId,
        external_sync_token: syncToken == null ? null : String(syncToken),
        metadata,
        last_synced_at: now,
        updated_at: now,
      }, { onConflict: "shop_id,provider,entity_type,local_id" });
      if (error) throw error;
    };
    const syncInvoice = async (square: Row) => {
      const amounts = invoiceAmounts(square, invoice.total);
      const status = String(square.status || "DRAFT").toUpperCase();
      const now = new Date().toISOString();
      const metadata = {
        ...(invoice.processor_metadata || {}),
        kind: "square_invoice",
        environment,
        square_customer_id: square.primary_recipient?.customer_id || invoice.processor_metadata?.square_customer_id || null,
        square_order_id: square.order_id || invoice.processor_metadata?.square_order_id || null,
        square_invoice_id: square.id,
        square_invoice_number: square.invoice_number || null,
        version: square.version ?? null,
        total_paid: amounts.paid,
        remaining_calculated: amounts.balance,
        due_date: amounts.dueDate,
        last_square_sync_at: now,
      };
      const { error: localError } = await admin.from("invoices").update({
        payment_processor: "square",
        processor_payment_id: square.id,
        processor_status: status,
        processor_payment_url: square.public_url || invoice.processor_payment_url || null,
        status: localStatus(status),
        paid_at: status === "PAID" ? (invoice.paid_at || square.updated_at || now) : invoice.paid_at,
        processor_metadata: metadata,
        payment_links: { ...(invoice.payment_links || {}), ...(square.public_url ? { square: square.public_url } : {}) },
        processor_last_error: null,
        updated_at: now,
      }).eq("id", invoice.id).eq("shop_id", membership.shop_id);
      if (localError) throw localError;
      const { error: mirrorError } = await admin.from("payment_processor_invoices").upsert({
        shop_id: membership.shop_id,
        provider: "square",
        external_invoice_id: square.id,
        local_invoice_id: invoice.id,
        external_order_id: square.order_id || null,
        external_customer_id: square.primary_recipient?.customer_id || null,
        local_customer_id: invoice.job_id ? (await admin.from("jobs").select("customer_id").eq("shop_id", membership.shop_id).eq("id", invoice.job_id).maybeSingle()).data?.customer_id || null : null,
        invoice_number: square.invoice_number || null,
        status,
        currency: amounts.currency,
        total: amounts.total,
        paid: amounts.paid,
        balance: amounts.balance,
        due_date: amounts.dueDate,
        public_url: square.public_url || null,
        metadata: { version: square.version ?? null, delivery_method: square.delivery_method || null, environment },
        provider_created_at: square.created_at || null,
        provider_updated_at: square.updated_at || null,
        last_synced_at: now,
        updated_at: now,
      }, { onConflict: "shop_id,provider,external_invoice_id" });
      if (mirrorError) throw mirrorError;
      await saveMapping("invoice", String(invoice.id), String(square.id), square.version, {
        square_order_id: square.order_id || null,
        environment,
      });
      Object.assign(invoice, {
        processor_payment_id: square.id,
        processor_status: status,
        processor_payment_url: square.public_url || invoice.processor_payment_url || null,
        processor_metadata: metadata,
        status: localStatus(status),
      });
      return { status, amounts };
    };

    const metadata = { ...(invoice.processor_metadata || {}) };
    const squareInvoiceId = String(metadata.square_invoice_id || invoice.processor_payment_id || "");
    if (action === "status") {
      if (!squareInvoiceId) return json({ provider: "square", created: false, status: invoice.status || "draft", dashboard_url: squareInvoicesAppUrl, dashboard_web_url: dashboardWebUrl });
      const data = await squareRequest(`/v2/invoices/${encodeURIComponent(squareInvoiceId)}`);
      if (!data.invoice) throw new Error("Square did not return the invoice.");
      const synced = await syncInvoice(data.invoice);
      return json({
        provider: "square",
        kind: "invoice",
        status: synced.status.toLowerCase(),
        invoice_number: data.invoice.invoice_number || null,
        payment_url: data.invoice.public_url || null,
        dashboard_url: squareInvoicesAppUrl,
        dashboard_web_url: dashboardWebUrl,
        total: synced.amounts.total,
        paid: synced.amounts.paid,
        balance: synced.amounts.balance,
      });
    }
    if (action === "publish") {
      if (!squareInvoiceId) return json({ error: "Create the Square draft first." }, 409);
      const current = await squareRequest(`/v2/invoices/${encodeURIComponent(squareInvoiceId)}`);
      if (!current.invoice) throw new Error("Square did not return the invoice.");
      if (String(current.invoice.status).toUpperCase() !== "DRAFT") {
        const synced = await syncInvoice(current.invoice);
        return json({ ok: true, already_published: true, status: synced.status.toLowerCase(), payment_url: current.invoice.public_url || null });
      }
      const data = await squareRequest(`/v2/invoices/${encodeURIComponent(squareInvoiceId)}/publish`, {
        method: "POST",
        body: JSON.stringify({ version: current.invoice.version, idempotency_key: `mma-publish-${invoice.id}-${current.invoice.version}` }),
      });
      const synced = await syncInvoice(data.invoice);
      return json({ ok: true, status: synced.status.toLowerCase(), payment_url: data.invoice.public_url || null, balance: synced.amounts.balance });
    }
    if (action === "cancel") {
      if (!squareInvoiceId) return json({ error: "This invoice is not linked to Square." }, 409);
      const current = await squareRequest(`/v2/invoices/${encodeURIComponent(squareInvoiceId)}`);
      if (!current.invoice) throw new Error("Square did not return the invoice.");
      const status = String(current.invoice.status || "").toUpperCase();
      if (status === "PAID") return json({ error: "A paid invoice cannot be canceled. Use a refund instead." }, 409);
      if (status === "CANCELED" || status === "CANCELLED") {
        await syncInvoice(current.invoice);
        return json({ ok: true, already_canceled: true, status: "canceled" });
      }
      const data = await squareRequest(`/v2/invoices/${encodeURIComponent(squareInvoiceId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ version: current.invoice.version }),
      });
      await syncInvoice(data.invoice);
      return json({ ok: true, status: "canceled" });
    }
    if (action === "refund") {
      if (!["shop_owner", "owner", "manager"].includes(String(membership.role))) return json({ error: "Only a shop owner or manager can issue refunds." }, 403);
      const amount = Number(body.amount || 0);
      if (!(amount > 0)) return json({ error: "A refund amount greater than zero is required." }, 400);
      let paymentQuery = admin.from("payment_transactions").select("*")
        .eq("shop_id", membership.shop_id).eq("provider", "square")
        .eq("local_invoice_id", invoice.id).eq("status", "COMPLETED")
        .order("paid_at", { ascending: false });
      const requestedPaymentId = String(body.payment_id || "");
      if (requestedPaymentId) paymentQuery = paymentQuery.eq("external_payment_id", requestedPaymentId);
      const { data: storedPayments, error: paymentsError } = await paymentQuery;
      if (paymentsError) throw paymentsError;
      if (!storedPayments?.length) return json({ error: "Synchronize Square payments before issuing this refund." }, 409);

      const available: Row[] = [];
      for (const stored of storedPayments) {
        const current = await squareRequest(`/v2/payments/${encodeURIComponent(stored.external_payment_id)}`);
        const payment = current.payment;
        if (!payment || String(payment.status || "").toUpperCase() !== "COMPLETED") continue;
        const refundableCents = Math.max(0, cents(dollars(payment.total_money) - dollars(payment.refunded_money)));
        if (refundableCents > 0) available.push({
          payment_id: String(payment.id),
          refundable_cents: refundableCents,
          currency: String(payment.total_money?.currency || stored.currency || "USD"),
        });
      }
      const requestedCents = cents(amount);
      const maximumCents = available.reduce((sum, payment) => sum + Number(payment.refundable_cents || 0), 0);
      if (requestedCents > maximumCents) return json({ error: `The maximum refundable amount is $${(maximumCents / 100).toFixed(2)}.` }, 409);

      const requestId = String(body.idempotency_key || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || crypto.randomUUID();
      let remaining = requestedCents;
      const refunds: Row[] = [];
      for (const payment of available) {
        if (remaining <= 0) break;
        const refundCents = Math.min(remaining, Number(payment.refundable_cents));
        const data = await squareRequest("/v2/refunds", {
          method: "POST",
          body: JSON.stringify({
            idempotency_key: `mma-${requestId}-${payment.payment_id}`.slice(0, 192),
            amount_money: { amount: refundCents, currency: payment.currency },
            payment_id: payment.payment_id,
            reason: String(body.reason || "Customer invoice refund").slice(0, 192),
          }),
        });
        refunds.push({
          refund_id: data.refund?.id || null,
          payment_id: payment.payment_id,
          status: String(data.refund?.status || "PENDING").toLowerCase(),
          amount: refundCents / 100,
        });
        remaining -= refundCents;
      }
      return json({ ok: true, refunds, status: refunds.every((refund) => refund.status === "completed") ? "completed" : "pending", amount: requestedCents / 100 });
    }
    if (action !== "create" && action !== "create_draft") return json({ error: "Unknown invoice action." }, 400);
    if (squareInvoiceId || metadata.kind === "square_invoice") {
      return json({
        provider: "square",
        kind: "existing_invoice",
        status: String(invoice.processor_status || "draft").toLowerCase(),
        invoice_number: metadata.square_invoice_number || null,
        payment_url: invoice.processor_payment_url || null,
        dashboard_url: squareInvoicesAppUrl,
        dashboard_web_url: dashboardWebUrl,
      });
    }

    const { data: job } = invoice.job_id ? await admin.from("jobs").select("id,customer_id")
      .eq("id", invoice.job_id).eq("shop_id", membership.shop_id).maybeSingle() : { data: null };
    const { data: customer } = job?.customer_id ? await admin.from("customers").select("*")
      .eq("id", job.customer_id).eq("shop_id", membership.shop_id).maybeSingle() : { data: null };
    const { data: shop } = await admin.from("shops").select("name").eq("shop_id", membership.shop_id).single();

    let squareCustomerId = String(metadata.square_customer_id || "");
    if (!squareCustomerId && customer?.id) {
      const { data: mapped } = await admin.from("integration_entity_mappings").select("external_id")
        .eq("shop_id", membership.shop_id).eq("provider", "square").eq("entity_type", "customer")
        .eq("local_id", String(customer.id)).maybeSingle();
      squareCustomerId = String(mapped?.external_id || "");
    }
    if (!squareCustomerId && customer) {
      const search = await squareRequest("/v2/customers/search", {
        method: "POST",
        body: JSON.stringify({ query: { filter: { reference_id: { exact: String(customer.id) } } }, limit: 1 }),
      });
      squareCustomerId = String(search.customers?.[0]?.id || "");
    }
    if (!squareCustomerId) {
      const names = splitName(customer?.name || "Customer");
      const payload: Row = {
        idempotency_key: `mma-customer-${customer?.id || invoice.id}`,
        ...names,
        reference_id: String(customer?.id || invoice.id),
      };
      if (customer?.email) payload.email_address = customer.email;
      if (customer?.phone) payload.phone_number = customer.phone;
      if (customer?.address) payload.address = { address_line_1: String(customer.address).slice(0, 500) };
      const created = await squareRequest("/v2/customers", { method: "POST", body: JSON.stringify(payload) });
      if (!created.customer?.id) throw new Error("Square customer creation failed.");
      squareCustomerId = String(created.customer.id);
      if (customer?.id) await saveMapping("customer", String(customer.id), squareCustomerId, created.customer.version, { environment });
    } else if (customer?.id) {
      await saveMapping("customer", String(customer.id), squareCustomerId, null, { environment });
    }

    const source = Array.isArray(invoice.line_items) && invoice.line_items.length
      ? invoice.line_items
      : [{ description: "Automotive repair services", amount: Number(invoice.subtotal || invoice.total || 0), quantity: 1 }];
    const lineItems: Row[] = [];
    for (let index = 0; index < source.length; index++) {
      const item = source[index] || {};
      const quantity = Math.max(1, Number(item.quantity || 1));
      const lineTotal = Number(item.amount ?? item.total ?? item.price ?? 0);
      const unit = Number(item.unit_price ?? (lineTotal / quantity));
      if (!(unit > 0)) continue;
      lineItems.push({
        name: String(item.description || item.name || `Repair item ${index + 1}`).slice(0, 120),
        quantity: String(quantity),
        base_price_money: { amount: Math.max(1, cents(unit)), currency: "USD" },
      });
    }
    const tax = Number(invoice.tax || 0);
    if (tax > 0) lineItems.push({ name: "Sales tax", quantity: "1", base_price_money: { amount: cents(tax), currency: "USD" } });
    if (!lineItems.length) return json({ error: "This invoice has no priced line items." }, 409);

    const orderData = await squareRequest("/v2/orders", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `mma-order-${invoice.id}`,
        order: {
          location_id: credential.location_id,
          reference_id: String(invoice.id),
          customer_id: squareCustomerId,
          line_items: lineItems,
        },
      }),
    });
    if (!orderData.order?.id) throw new Error("Square order creation failed.");

    const invoiceData = await squareRequest("/v2/invoices", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `mma-invoice-${invoice.id}`,
        invoice: {
          location_id: credential.location_id,
          order_id: orderData.order.id,
          primary_recipient: { customer_id: squareCustomerId },
          delivery_method: "SHARE_MANUALLY",
          payment_requests: [{
            request_type: "BALANCE",
            due_date: dueDate(Number(body.days_until_due || 7)),
            tipping_enabled: false,
            automatic_payment_source: "NONE",
          }],
          accepted_payment_methods: {
            card: true,
            square_gift_card: false,
            bank_account: false,
            buy_now_pay_later: false,
            cash_app_pay: true,
          },
          title: "Automotive Repair",
          description: `${shop?.name || "Repair Shop"} repair invoice`,
        },
      }),
    });
    if (!invoiceData.invoice?.id) throw new Error("Square invoice creation failed.");
    const synced = await syncInvoice(invoiceData.invoice);
    return json({
      provider: "square",
      kind: "invoice_draft",
      status: synced.status.toLowerCase(),
      invoice_number: invoiceData.invoice.invoice_number || null,
      dashboard_url: squareInvoicesAppUrl,
      dashboard_web_url: dashboardWebUrl,
      amount_due: synced.amounts.balance,
      message: "Draft created in Square. Review it before sending.",
    });
  } catch (error) {
    console.error(error);
    if (admin && localInvoice?.id) {
      await admin.from("invoices").update({
        processor_last_error: error instanceof Error ? error.message.slice(0, 500) : "Square invoice request failed.",
        updated_at: new Date().toISOString(),
      }).eq("id", localInvoice.id);
    }
    return json({ error: error instanceof Error ? error.message : "Square invoice request failed." }, 500);
  }
});
