import { createClient } from "npm:@supabase/supabase-js@2.112.4";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function envKey(jsonName: string, legacyName: string) {
  try {
    const parsed = JSON.parse(Deno.env.get(jsonName) || "{}");
    if (parsed?.default) return String(parsed.default);
  } catch { /* legacy secret below */ }
  return Deno.env.get(legacyName) || "";
}
function base64Bytes(value: string) {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}
function constantTimeEqual(left: string, right: string) {
  const a = base64Bytes(left);
  const b = base64Bytes(right);
  let different = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) different |= (a[index] || 0) ^ (b[index] || 0);
  return different === 0;
}
async function expectedSignature(key: string, notificationUrl: string, body: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(`${notificationUrl}${body}`),
  ));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const service = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const signatureKey = Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY") || "";
  const notificationUrl = Deno.env.get("SQUARE_WEBHOOK_NOTIFICATION_URL")
    || `${supabaseUrl}/functions/v1/square-webhook`;
  if (!supabaseUrl || !service || !signatureKey) {
    console.error("Square webhook is missing required server configuration.");
    return json({ error: "Webhook is not configured." }, 503);
  }

  const rawBody = await req.text();
  const supplied = req.headers.get("x-square-hmacsha256-signature") || "";
  const expected = await expectedSignature(signatureKey, notificationUrl, rawBody);
  if (!supplied || !constantTimeEqual(supplied, expected)) return json({ error: "Invalid signature." }, 403);

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const eventId = String(event.event_id || "");
  const eventType = String(event.type || "unknown");
  const merchantId = String(event.merchant_id || "");
  if (!eventId) return json({ error: "event_id is required." }, 400);

  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });
  const { data: credential, error: credentialError } = await admin.from("payment_processor_credentials")
    .select("shop_id").eq("provider", "square").eq("merchant_id", merchantId).maybeSingle();
  if (credentialError) {
    console.error(credentialError);
    return json({ error: "Could not resolve Square merchant." }, 500);
  }
  const supported = /^(customer|invoice|payment|refund)\./.test(eventType);
  const status = !credential?.shop_id || !supported ? "ignored" : "processing";
  const { error: insertError } = await admin.from("square_webhook_events").insert({
    event_id: eventId,
    shop_id: credential?.shop_id || null,
    merchant_id: merchantId || null,
    event_type: eventType,
    status,
    processed_at: status === "ignored" ? new Date().toISOString() : null,
  });
  if (insertError?.code === "23505") return json({ ok: true, duplicate: true });
  if (insertError) {
    console.error(insertError);
    return json({ error: "Could not record webhook." }, 500);
  }
  if (status === "ignored") return json({ ok: true, ignored: true });

  const processEvent = async () => {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/square-sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${service}`,
          apikey: service,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "sync_all", shop_id: credential.shop_id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) throw new Error(data?.error || `Square sync returned ${response.status}.`);
      await admin.from("square_webhook_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
        error: null,
      }).eq("event_id", eventId);
    } catch (error) {
      console.error(error);
      await admin.from("square_webhook_events").update({
        status: "failed",
        processed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message.slice(0, 500) : "Square sync failed.",
      }).eq("event_id", eventId);
    }
  };
  EdgeRuntime.waitUntil(processEvent());
  return json({ ok: true }, 202);
});
