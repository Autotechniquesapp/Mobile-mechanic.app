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
function dollars(money: Row | null | undefined) {
  return Math.max(0, Number(money?.amount || 0) / 100);
}
function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
function normalizedPhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
function splitName(value: unknown) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return { given_name: parts[0] || "Customer", family_name: parts.slice(1).join(" ") || undefined };
}
function squareCustomerName(customer: Row) {
  return [customer.given_name, customer.family_name].filter(Boolean).join(" ").trim()
    || String(customer.company_name || "Square Customer");
}
function squareAddress(customer: Row) {
  const a = customer.address || {};
  return [a.address_line_1, a.address_line_2, a.locality, a.administrative_district_level_1, a.postal_code]
    .filter(Boolean).join(", ");
}
function changedAfter(value: unknown, baseline: unknown) {
  const time = new Date(String(value || "")).getTime();
  const last = new Date(String(baseline || "")).getTime();
  return Number.isFinite(time) && (!Number.isFinite(last) || time > last + 1000);
}
function localStatus(squareStatus: unknown) {
  const status = String(squareStatus || "DRAFT").toUpperCase();
  if (status === "DRAFT") return "draft";
  if (status === "PAID") return "paid";
  if (status === "PARTIALLY_PAID") return "partially_paid";
  if (status === "CANCELED" || status === "CANCELLED") return "void";
  return "sent";
}

async function squareRequest(ctx: Row, path: string, init: RequestInit = {}) {
  const response = await fetch(`${ctx.api}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Square-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const first = data?.errors?.[0] || {};
    const code = String(first.code || "");
    const detail = String(first.detail || "");
    const authorizationFailure = response.status === 401 || response.status === 403
      || /UNAUTHORIZED|FORBIDDEN|INSUFFICIENT|ACCESS_TOKEN/.test(code);
    if (authorizationFailure) {
      throw new Error("Square authorization needs updated permissions. Tap Manage / Reconnect, approve customer, invoice, order, and payment access, then run Sync Square Now again.");
    }
    throw new Error(detail || code || `Square request failed (${response.status}).`);
  }
  return data;
}

async function listSquare(ctx: Row, path: string, key: string, maxPages = 10) {
  const rows: Row[] = [];
  let cursor = "";
  for (let page = 0; page < maxPages; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const data = await squareRequest(ctx, `${path}${cursor ? `${separator}cursor=${encodeURIComponent(cursor)}` : ""}`);
    rows.push(...(Array.isArray(data?.[key]) ? data[key] : []));
    cursor = String(data?.cursor || "");
    if (!cursor) break;
  }
  return rows;
}

async function loadContext(admin: any, shopId: string) {
  const { data: processor, error: processorError } = await admin.from("shop_payment_processors")
    .select("status").eq("shop_id", shopId).eq("provider", "square").maybeSingle();
  if (processorError) throw processorError;
  if (!processor || processor.status !== "connected") throw new Error("Square is not connected for this shop.");

  const { data: credential, error: credentialError } = await admin.from("payment_processor_credentials")
    .select("*").eq("shop_id", shopId).eq("provider", "square").maybeSingle();
  if (credentialError) throw credentialError;
  if (!credential?.access_token || !credential?.location_id) throw new Error("Reconnect Square in Payment Processing.");

  const environment = String(credential.credential_metadata?.environment || Deno.env.get("SQUARE_ENVIRONMENT") || "production").toLowerCase();
  const api = environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const oauth = environment === "sandbox" ? "https://connect.squareupsandbox.com/oauth2" : "https://connect.squareup.com/oauth2";
  let token = String(credential.access_token);

  if (credential.refresh_token && credential.token_expires_at
      && new Date(credential.token_expires_at).getTime() < Date.now() + 48 * 3600 * 1000) {
    const appId = Deno.env.get("SQUARE_APPLICATION_ID") || "";
    const appSecret = Deno.env.get("SQUARE_APPLICATION_SECRET") || "";
    if (!appId || !appSecret) throw new Error("Square application credentials are missing.");
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
    if (!response.ok || !refreshed.access_token) {
      throw new Error(refreshed?.errors?.[0]?.detail || "Square token refresh failed.");
    }
    token = String(refreshed.access_token);
    const { error } = await admin.from("payment_processor_credentials").update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || credential.refresh_token,
      token_expires_at: refreshed.expires_at || null,
      updated_at: new Date().toISOString(),
    }).eq("id", credential.id);
    if (error) throw error;
  }

  return { admin, shopId, credential, environment, api, token };
}

async function mappings(ctx: Row, entityType: string) {
  const { data, error } = await ctx.admin.from("integration_entity_mappings").select("*")
    .eq("shop_id", ctx.shopId).eq("provider", "square").eq("entity_type", entityType);
  if (error) throw error;
  return data || [];
}

async function saveMapping(ctx: Row, entityType: string, localId: string, externalId: string, syncToken: unknown, metadata: Row = {}) {
  const now = new Date().toISOString();
  const { error } = await ctx.admin.from("integration_entity_mappings").upsert({
    shop_id: ctx.shopId,
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
}

function localCustomerPayload(customer: Row) {
  const name = splitName(customer.name);
  const payload: Row = {
    ...name,
    reference_id: String(customer.id),
  };
  if (customer.email) payload.email_address = String(customer.email).trim();
  if (customer.phone) payload.phone_number = String(customer.phone).trim();
  if (customer.address) payload.address = { address_line_1: String(customer.address).trim().slice(0, 500) };
  return payload;
}

async function syncCustomers(ctx: Row) {
  const squareCustomers = await listSquare(ctx, "/v2/customers?limit=100&sort_field=UPDATED_AT&sort_order=ASC", "customers");
  const [{ data: localRows, error: localError }, mappingRows] = await Promise.all([
    ctx.admin.from("customers").select("*").eq("shop_id", ctx.shopId),
    mappings(ctx, "customer"),
  ]);
  if (localError) throw localError;

  const localCustomers: Row[] = localRows || [];
  const localById = new Map(localCustomers.map((row) => [String(row.id), row]));
  const localByEmail = new Map(localCustomers.filter((row) => normalizedEmail(row.email)).map((row) => [normalizedEmail(row.email), row]));
  const localByPhone = new Map(localCustomers.filter((row) => normalizedPhone(row.phone)).map((row) => [normalizedPhone(row.phone), row]));
  const mappingByExternal = new Map(mappingRows.map((row: Row) => [String(row.external_id), row]));
  const mappingByLocal = new Map(mappingRows.map((row: Row) => [String(row.local_id), row]));
  let imported = 0, exported = 0, updated = 0, matched = 0, duplicates = 0;

  for (const external of squareCustomers) {
    let existingMapping = mappingByExternal.get(String(external.id));
    let local = existingMapping ? localById.get(String(existingMapping.local_id)) : null;
    if (existingMapping && !local) {
      const { error } = await ctx.admin.from("integration_entity_mappings").delete()
        .eq("id", existingMapping.id).eq("shop_id", ctx.shopId);
      if (error) throw error;
      mappingByExternal.delete(String(external.id));
      mappingByLocal.delete(String(existingMapping.local_id));
      existingMapping = null;
    }
    if (!local && external.reference_id) local = localById.get(String(external.reference_id));
    if (!local && normalizedEmail(external.email_address)) local = localByEmail.get(normalizedEmail(external.email_address));
    if (!local && normalizedPhone(external.phone_number)) local = localByPhone.get(normalizedPhone(external.phone_number));
    const localMapping = local ? mappingByLocal.get(String(local.id)) : null;
    if (localMapping && String(localMapping.external_id) !== String(external.id)) {
      duplicates++;
      continue;
    }

    if (!local) {
      const row = {
        shop_id: ctx.shopId,
        name: squareCustomerName(external),
        phone: external.phone_number || null,
        email: external.email_address || null,
        address: squareAddress(external) || null,
      };
      const { data, error } = await ctx.admin.from("customers").insert(row).select("*").single();
      if (error) throw error;
      local = data;
      localCustomers.push(local);
      localById.set(String(local.id), local);
      if (normalizedEmail(local.email)) localByEmail.set(normalizedEmail(local.email), local);
      if (normalizedPhone(local.phone)) localByPhone.set(normalizedPhone(local.phone), local);
      imported++;
    } else if (existingMapping) {
      const localChanged = changedAfter(local.updated_at, existingMapping.last_synced_at);
      const squareChanged = changedAfter(external.updated_at, existingMapping.last_synced_at);
      if (localChanged && !squareChanged) {
        const payload = { ...localCustomerPayload(local), version: external.version };
        const data = await squareRequest(ctx, `/v2/customers/${encodeURIComponent(external.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        Object.assign(external, data.customer || {});
        exported++;
      } else if (squareChanged) {
        const patch = {
          name: squareCustomerName(external),
          phone: external.phone_number || null,
          email: external.email_address || null,
          address: squareAddress(external) || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await ctx.admin.from("customers").update(patch)
          .eq("shop_id", ctx.shopId).eq("id", local.id);
        if (error) throw error;
        Object.assign(local, patch);
        updated++;
      } else matched++;
    } else matched++;

    await saveMapping(ctx, "customer", String(local.id), String(external.id), external.version, {
      square_updated_at: external.updated_at || null,
      environment: ctx.environment,
    });
    mappingByLocal.set(String(local.id), { local_id: local.id, external_id: external.id, last_synced_at: new Date().toISOString() });
    mappingByExternal.set(String(external.id), { local_id: local.id, external_id: external.id, last_synced_at: new Date().toISOString() });
  }

  for (const local of localCustomers) {
    if (mappingByLocal.has(String(local.id))) continue;
    const data = await squareRequest(ctx, "/v2/customers", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `mma-customer-${local.id}`,
        ...localCustomerPayload(local),
      }),
    });
    const external = data.customer;
    if (!external?.id) throw new Error("Square did not return a customer ID.");
    await saveMapping(ctx, "customer", String(local.id), String(external.id), external.version, {
      square_updated_at: external.updated_at || null,
      environment: ctx.environment,
    });
    mappingByLocal.set(String(local.id), { local_id: local.id, external_id: external.id });
    exported++;
  }

  return { square: squareCustomers.length, local: localCustomers.length, imported, exported, updated, matched, duplicates };
}

function invoiceMoney(invoice: Row) {
  const requests = Array.isArray(invoice.payment_requests) ? invoice.payment_requests : [];
  const total = requests.reduce((sum: number, request: Row) => sum + dollars(request.computed_amount_money), 0);
  const paid = requests.reduce((sum: number, request: Row) => sum + dollars(request.total_completed_amount_money), 0);
  const due = requests.find((request: Row) => dollars(request.total_completed_amount_money) < dollars(request.computed_amount_money));
  return {
    total,
    paid,
    balance: Math.max(0, total - paid),
    currency: String(requests[0]?.computed_amount_money?.currency || "USD"),
    dueDate: due?.due_date || requests[0]?.due_date || null,
  };
}

async function syncInvoices(ctx: Row) {
  const squareInvoices = await listSquare(ctx, `/v2/invoices?location_id=${encodeURIComponent(ctx.credential.location_id)}&limit=100`, "invoices");
  const [{ data: localRows, error: localError }, invoiceMappings, customerMappings] = await Promise.all([
    ctx.admin.from("invoices").select("*").eq("shop_id", ctx.shopId).eq("payment_processor", "square"),
    mappings(ctx, "invoice"),
    mappings(ctx, "customer"),
  ]);
  if (localError) throw localError;
  const localInvoices: Row[] = localRows || [];
  const localById = new Map(localInvoices.map((row) => [String(row.id), row]));
  const localByExternal = new Map<string, Row>();
  for (const row of localInvoices) {
    const externalId = row.processor_payment_id || row.processor_metadata?.square_invoice_id;
    if (externalId) localByExternal.set(String(externalId), row);
  }
  const mappingByExternal = new Map(invoiceMappings.map((row: Row) => [String(row.external_id), row]));
  const customerByExternal = new Map(customerMappings.map((row: Row) => [String(row.external_id), String(row.local_id)]));
  let linked = 0, imported = 0, paidCount = 0, openCount = 0;
  let openBalance = 0;

  for (const square of squareInvoices) {
    const mapped = mappingByExternal.get(String(square.id));
    const local = localByExternal.get(String(square.id)) || (mapped ? localById.get(String(mapped.local_id)) : null);
    const amounts = invoiceMoney(square);
    const status = String(square.status || "DRAFT").toUpperCase();
    const localCustomerId = square.primary_recipient?.customer_id
      ? customerByExternal.get(String(square.primary_recipient.customer_id)) || null
      : null;
    const now = new Date().toISOString();
    const row = {
      shop_id: ctx.shopId,
      provider: "square",
      external_invoice_id: String(square.id),
      local_invoice_id: local?.id || null,
      external_order_id: square.order_id || null,
      external_customer_id: square.primary_recipient?.customer_id || null,
      local_customer_id: localCustomerId,
      invoice_number: square.invoice_number || null,
      status,
      currency: amounts.currency,
      total: amounts.total || Number(local?.total || 0),
      paid: amounts.paid,
      balance: amounts.total ? amounts.balance : Math.max(0, Number(local?.total || 0) - amounts.paid),
      due_date: amounts.dueDate,
      public_url: square.public_url || null,
      metadata: {
        version: square.version ?? null,
        delivery_method: square.delivery_method || null,
        environment: ctx.environment,
      },
      provider_created_at: square.created_at || null,
      provider_updated_at: square.updated_at || null,
      last_synced_at: now,
      updated_at: now,
    };
    const { error: mirrorError } = await ctx.admin.from("payment_processor_invoices").upsert(row, {
      onConflict: "shop_id,provider,external_invoice_id",
    });
    if (mirrorError) throw mirrorError;

    if (local) {
      const paidAt = status === "PAID" ? (local.paid_at || square.updated_at || now) : local.paid_at;
      const { error } = await ctx.admin.from("invoices").update({
        status: localStatus(status),
        processor_payment_id: String(square.id),
        processor_status: status,
        processor_payment_url: square.public_url || local.processor_payment_url || null,
        paid_at: paidAt,
        payment_links: { ...(local.payment_links || {}), ...(square.public_url ? { square: square.public_url } : {}) },
        processor_metadata: {
          ...(local.processor_metadata || {}),
          kind: "square_invoice",
          environment: ctx.environment,
          square_invoice_id: String(square.id),
          square_order_id: square.order_id || null,
          square_customer_id: square.primary_recipient?.customer_id || null,
          square_invoice_number: square.invoice_number || null,
          version: square.version ?? null,
          total_paid: amounts.paid,
          remaining_calculated: row.balance,
          due_date: amounts.dueDate,
          last_square_sync_at: now,
        },
        processor_last_error: null,
        updated_at: now,
      }).eq("shop_id", ctx.shopId).eq("id", local.id);
      if (error) throw error;
      await saveMapping(ctx, "invoice", String(local.id), String(square.id), square.version, {
        square_order_id: square.order_id || null,
        environment: ctx.environment,
      });
      linked++;
    } else imported++;

    if (status === "PAID") paidCount++;
    if (["UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING", "SCHEDULED"].includes(status)) {
      openCount++;
      openBalance += Number(row.balance || 0);
    }
  }
  return { square: squareInvoices.length, linked, imported, paid: paidCount, open: openCount, open_balance: Math.round(openBalance * 100) / 100 };
}

async function syncPayments(ctx: Row) {
  const squarePayments = await listSquare(ctx, `/v2/payments?location_id=${encodeURIComponent(ctx.credential.location_id)}&limit=100&sort_order=ASC`, "payments");
  const [{ data: invoiceRows, error: invoiceError }, customerMappings] = await Promise.all([
    ctx.admin.from("payment_processor_invoices").select("external_order_id,local_invoice_id")
      .eq("shop_id", ctx.shopId).eq("provider", "square"),
    mappings(ctx, "customer"),
  ]);
  if (invoiceError) throw invoiceError;
  const invoiceByOrder = new Map((invoiceRows || []).filter((row: Row) => row.external_order_id)
    .map((row: Row) => [String(row.external_order_id), row.local_invoice_id || null]));
  const customerByExternal = new Map(customerMappings.map((row: Row) => [String(row.external_id), String(row.local_id)]));
  let completed = 0, refunded = 0;
  let collected = 0;

  for (const payment of squarePayments) {
    const status = String(payment.status || "UNKNOWN").toUpperCase();
    const amount = dollars(payment.total_money);
    const refundedAmount = dollars(payment.refunded_money);
    const fees = (Array.isArray(payment.processing_fee) ? payment.processing_fee : [])
      .reduce((sum: number, fee: Row) => sum + dollars(fee.amount_money), 0);
    const now = new Date().toISOString();
    const { error } = await ctx.admin.from("payment_transactions").upsert({
      shop_id: ctx.shopId,
      provider: "square",
      external_payment_id: String(payment.id),
      local_invoice_id: payment.order_id ? invoiceByOrder.get(String(payment.order_id)) || null : null,
      local_customer_id: payment.customer_id ? customerByExternal.get(String(payment.customer_id)) || null : null,
      external_order_id: payment.order_id || null,
      external_customer_id: payment.customer_id || null,
      location_id: payment.location_id || null,
      status,
      source_type: payment.source_type || null,
      currency: String(payment.total_money?.currency || "USD"),
      amount,
      refunded: refundedAmount,
      tip: dollars(payment.tip_money),
      processing_fee: fees,
      receipt_url: payment.receipt_url || null,
      paid_at: status === "COMPLETED" ? (payment.created_at || payment.updated_at || now) : null,
      metadata: {
        environment: ctx.environment,
        receipt_number: payment.receipt_number || null,
      },
      provider_created_at: payment.created_at || null,
      provider_updated_at: payment.updated_at || null,
      last_synced_at: now,
      updated_at: now,
    }, { onConflict: "shop_id,provider,external_payment_id" });
    if (error) throw error;
    if (status === "COMPLETED") {
      completed++;
      collected += Math.max(0, amount - refundedAmount);
    }
    if (refundedAmount > 0) refunded++;
  }
  return {
    square: squarePayments.length,
    completed,
    refunded,
    net_collected: Math.round(collected * 100) / 100,
  };
}

async function storedStatus(admin: any, shopId: string) {
  const [{ data: invoiceRows, error: invoiceError }, { data: paymentRows, error: paymentError }, { data: processor, error: processorError }] = await Promise.all([
    admin.from("payment_processor_invoices").select("status,balance").eq("shop_id", shopId).eq("provider", "square"),
    admin.from("payment_transactions").select("status,amount,refunded").eq("shop_id", shopId).eq("provider", "square"),
    admin.from("shop_payment_processors").select("status,last_synced_at,last_error").eq("shop_id", shopId).eq("provider", "square").maybeSingle(),
  ]);
  if (invoiceError) throw invoiceError;
  if (paymentError) throw paymentError;
  if (processorError) throw processorError;
  const openInvoices = (invoiceRows || []).filter((row: Row) => ["UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING", "SCHEDULED"].includes(String(row.status)));
  const completedPayments = (paymentRows || []).filter((row: Row) => String(row.status) === "COMPLETED");
  return {
    connected: processor?.status === "connected",
    last_synced_at: processor?.last_synced_at || null,
    last_error: processor?.last_error || null,
    invoices: {
      total: (invoiceRows || []).length,
      open: openInvoices.length,
      open_balance: Math.round(openInvoices.reduce((sum: number, row: Row) => sum + Number(row.balance || 0), 0) * 100) / 100,
    },
    payments: {
      total: (paymentRows || []).length,
      completed: completedPayments.length,
      net_collected: Math.round(completedPayments.reduce((sum: number, row: Row) => sum + Math.max(0, Number(row.amount || 0) - Number(row.refunded || 0)), 0) * 100) / 100,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const service = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !publishable || !service) throw new Error("Supabase function secrets are unavailable.");
    const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get("Authorization") || "";
    const internal = auth === `Bearer ${service}`;
    let shopId = internal ? String(body.shop_id || "") : "";

    if (!internal) {
      const userClient = createClient(supabaseUrl, publishable, {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Authentication required." }, 401);
      const requestedShopId = String(body.shop_id || "");
      let membershipQuery = admin.from("shop_members").select("shop_id,role,status")
        .eq("user_id", user.id).eq("status", "active");
      if (requestedShopId) membershipQuery = membershipQuery.eq("shop_id", requestedShopId);
      const { data: membership, error } = await membershipQuery.limit(1).maybeSingle();
      if (error) throw error;
      if (!membership) return json({ error: "Active shop membership required." }, 403);
      if (!["shop_owner", "owner", "manager", "service_writer"].includes(String(membership.role))) {
        return json({ error: "Your shop role cannot view or synchronize payment records." }, 403);
      }
      shopId = String(membership.shop_id);
    }
    if (!shopId) return json({ error: "shop_id is required." }, 400);

    const action = String(body.action || "sync_all");
    if (action === "status") return json(await storedStatus(admin, shopId));
    if (!["sync_all", "sync_customers", "sync_invoices", "sync_payments"].includes(action)) {
      return json({ error: "Unknown Square sync action." }, 400);
    }

    const ctx = await loadContext(admin, shopId);
    const result: Row = {};
    if (action === "sync_all" || action === "sync_customers") result.customers = await syncCustomers(ctx);
    if (action === "sync_all" || action === "sync_invoices") result.invoices = await syncInvoices(ctx);
    if (action === "sync_all" || action === "sync_payments") result.payments = await syncPayments(ctx);
    const now = new Date().toISOString();
    const { error: processorError } = await admin.from("shop_payment_processors").update({
      last_synced_at: now,
      last_error: null,
      capabilities: {
        cards: true,
        payment_links: true,
        invoices: true,
        customers_sync: true,
        payments_sync: true,
        refunds: true,
        cash_app_pay: true,
      },
      updated_at: now,
    }).eq("shop_id", shopId).eq("provider", "square");
    if (processorError) throw processorError;
    return json({ ok: true, synced_at: now, ...result, status: await storedStatus(admin, shopId) });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Square synchronization failed." }, 500);
  }
});
