import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function getSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const keys = JSON.parse(modern);
      if (keys?.default) return String(keys.default);
    } catch (_) {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return json({ error: "Invalid request" }, 400); }

  const action = String(payload.action || "");
  const token = String(payload.token || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) return json({ error: "Invalid estimate link" }, 400);
  if (action !== "get" && action !== "decision") return json({ error: "Invalid action" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!url || !secretKey) return json({ error: "Estimate service is not configured" }, 500);

  let rpc = "get_customer_estimate";
  let args: Record<string, unknown> = { p_token: token };
  if (action === "decision") {
    const decision = String(payload.decision || "");
    const option = payload.option == null ? null : String(payload.option);
    const customerName = payload.customerName == null ? null : String(payload.customerName).trim().slice(0, 160);
    if (decision !== "approved" && decision !== "declined") return json({ error: "Invalid decision" }, 400);
    rpc = "submit_customer_estimate_decision";
    args = { p_token: token, p_decision: decision, p_option: option, p_customer_name: customerName };
  }

  const upstream = await fetch(`${url}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: { "apikey": secretKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await upstream.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!upstream.ok) {
    const message = (data && typeof data === "object" && "message" in data) ? String((data as {message?: unknown}).message || "Request failed") : "Request failed";
    return json({ error: message }, upstream.status >= 500 ? 500 : 400);
  }
  return json({ data });
});
