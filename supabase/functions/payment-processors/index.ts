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

function envKey(jsonName: string, legacyName: string) {
  try {
    const parsed = JSON.parse(Deno.env.get(jsonName) || "{}");
    if (parsed?.default) return String(parsed.default);
  } catch { /* legacy secret below */ }
  return Deno.env.get(legacyName) || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
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
    const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Authentication required." }, 401);
    const body = await req.json().catch(() => ({}));
    const requestedShopId = String(body.shop_id || "");
    let membershipQuery = admin.from("shop_members").select("shop_id,role,status")
      .eq("user_id", user.id).eq("status", "active");
    if (requestedShopId) membershipQuery = membershipQuery.eq("shop_id", requestedShopId);
    const { data: membership, error: membershipError } = await membershipQuery.limit(1).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: "Active shop membership required." }, 403);

    const action = String(body.action || "status");
    const canManage = ["shop_owner", "owner", "manager"].includes(String(membership.role));

    if (action === "set_default") {
      if (!canManage) return json({ error: "Only a shop owner or manager can change payment settings." }, 403);
      const provider = String(body.provider || "");
      if (!["stripe", "square", "paypal"].includes(provider)) return json({ error: "Unsupported payment processor." }, 400);
      const { data: processor, error: processorError } = await admin.from("shop_payment_processors")
        .select("provider,status").eq("shop_id", membership.shop_id).eq("provider", provider).maybeSingle();
      if (processorError) throw processorError;
      if (!processor || processor.status !== "connected") return json({ error: `${provider} must be connected before it can be the default processor.` }, 409);
      const now = new Date().toISOString();
      const { error: clearError } = await admin.from("shop_payment_processors").update({ is_default: false, updated_at: now })
        .eq("shop_id", membership.shop_id).eq("is_default", true);
      if (clearError) throw clearError;
      const { error } = await admin.from("shop_payment_processors").update({ is_default: true, updated_at: now })
        .eq("shop_id", membership.shop_id).eq("provider", provider);
      if (error) throw error;
    } else if (action === "disconnect") {
      if (!canManage) return json({ error: "Only a shop owner or manager can disconnect payment processing." }, 403);
      const provider = String(body.provider || "");
      if (provider !== "square") {
        return json({ error: `Disconnect ${provider || "this processor"} from its provider settings.` }, 400);
      }
      const { data: credential, error: credentialError } = await admin.from("payment_processor_credentials")
        .select("id,access_token,credential_metadata").eq("shop_id", membership.shop_id).eq("provider", "square").maybeSingle();
      if (credentialError) throw credentialError;
      if (credential?.access_token) {
        const appId = Deno.env.get("SQUARE_APPLICATION_ID") || "";
        const appSecret = Deno.env.get("SQUARE_APPLICATION_SECRET") || "";
        if (!appId || !appSecret) return json({ error: "Square application credentials are missing; the connection was not removed." }, 503);
        const environment = String(credential.credential_metadata?.environment || Deno.env.get("SQUARE_ENVIRONMENT") || "production").toLowerCase();
        const oauth = environment === "sandbox" ? "https://connect.squareupsandbox.com/oauth2" : "https://connect.squareup.com/oauth2";
        const response = await fetch(`${oauth}/revoke`, {
          method: "POST",
          headers: {
            Authorization: `Client ${appSecret}`,
            "Square-Version": API_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ client_id: appId, access_token: credential.access_token }),
        });
        const result = await response.json().catch(() => ({}));
        const codes = new Set((result?.errors || []).map((entry: Record<string, unknown>) => String(entry.code || "")));
        const alreadyInvalid = codes.has("NOT_FOUND") || codes.has("ACCESS_TOKEN_EXPIRED");
        if (!response.ok && !alreadyInvalid) {
          return json({ error: result?.errors?.[0]?.detail || "Square rejected the disconnect request; the connection was not removed." }, 502);
        }
      }
      if (credential?.id) {
        const { error } = await admin.from("payment_processor_credentials").delete()
          .eq("id", credential.id).eq("shop_id", membership.shop_id).eq("provider", "square");
        if (error) throw error;
      }
      const now = new Date().toISOString();
      const { error: processorError } = await admin.from("shop_payment_processors").update({
        status: "not_connected",
        is_default: false,
        external_account_id: null,
        public_settings: {},
        capabilities: {},
        last_error: null,
        last_synced_at: null,
        updated_at: now,
      }).eq("shop_id", membership.shop_id).eq("provider", "square");
      if (processorError) throw processorError;
    } else if (action !== "status") {
      return json({ error: "Unknown payment processor action." }, 400);
    }

    const { data: shop, error: shopError } = await admin.from("shops")
      .select("stripe_connected_account_id,stripe_connect_charges_enabled,stripe_connect_last_synced_at,stripe_tax_enabled")
      .eq("shop_id", membership.shop_id).single();
    if (shopError) throw shopError;
    if (shop) {
      const stripeStatus = shop.stripe_connected_account_id
        ? (shop.stripe_connect_charges_enabled ? "connected" : "connecting")
        : "not_connected";
      const { error } = await admin.from("shop_payment_processors").update({
        status: stripeStatus,
        external_account_id: shop.stripe_connected_account_id || null,
        capabilities: { cards: !!shop.stripe_connect_charges_enabled, invoices: true, tax: !!shop.stripe_tax_enabled },
        last_synced_at: shop.stripe_connect_last_synced_at || null,
        updated_at: new Date().toISOString(),
      }).eq("shop_id", membership.shop_id).eq("provider", "stripe");
      if (error) throw error;
    }

    const squareReady = !!(Deno.env.get("SQUARE_APPLICATION_ID") && Deno.env.get("SQUARE_APPLICATION_SECRET"));
    const paypalReady = !!(Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_CLIENT_SECRET") && Deno.env.get("PAYPAL_PARTNER_ID"));
    const { data: credentials, error: credentialsError } = await admin.from("payment_processor_credentials")
      .select("provider,merchant_id,location_id,token_expires_at").eq("shop_id", membership.shop_id);
    if (credentialsError) throw credentialsError;
    const squareCredential = credentials?.find((row: Record<string, unknown>) => row.provider === "square");
    const paypalCredential = credentials?.find((row: Record<string, unknown>) => row.provider === "paypal");
    const now = new Date().toISOString();
    const { error: squareError } = await admin.from("shop_payment_processors").update({
      status: squareCredential?.merchant_id ? "connected" : (squareReady ? "not_connected" : "needs_keys"),
      external_account_id: squareCredential?.merchant_id || null,
      updated_at: now,
    }).eq("shop_id", membership.shop_id).eq("provider", "square");
    if (squareError) throw squareError;
    const { error: paypalError } = await admin.from("shop_payment_processors").update({
      status: paypalCredential?.merchant_id ? "connected" : (paypalReady ? "not_connected" : "needs_keys"),
      external_account_id: paypalCredential?.merchant_id || null,
      updated_at: now,
    }).eq("shop_id", membership.shop_id).eq("provider", "paypal");
    if (paypalError) throw paypalError;

    const { data, error } = await admin.from("shop_payment_processors")
      .select("provider,status,is_default,display_name,external_account_id,public_settings,capabilities,last_error,last_synced_at")
      .eq("shop_id", membership.shop_id).order("provider");
    if (error) throw error;
    return json({ processors: data || [], configuration: { square: squareReady, paypal: paypalReady } });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Payment processor request failed." }, 500);
  }
});
