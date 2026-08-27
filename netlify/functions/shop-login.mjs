import {
  buildSessionPayload,
  cleanEmail,
  json,
  methodNotAllowed,
  parseBody,
  safeError,
  sessionCookies,
  supabaseRequest
} from "./_shared.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  try {
    const body = parseBody(event);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    if (!email || !password) return json(400, { error: "Enter the account email and password." });

    const session = await supabaseRequest("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password }
    });

    let payload = await buildSessionPayload(session.user, session.access_token);
    const pending = session.user?.user_metadata?.pending_shop;
    if (!payload.memberships.length && pending?.name && pending?.slug) {
      await supabaseRequest("/rest/v1/rpc/bootstrap_shop", {
        method: "POST",
        token: session.access_token,
        body: {
          p_name: pending.name,
          p_slug: pending.slug,
          p_phone: pending.phone || "",
          p_address: pending.address || "",
          p_service_area: pending.service_area || "",
          p_plan: pending.plan || "solo",
          p_labor_rate: Number(pending.labor_rate || 0),
          p_tax_rate: Number(pending.tax_rate || 0),
          p_service_call_fee: Number(pending.service_call_fee || 0),
          p_parts_markup: Number(pending.parts_markup || 0),
          p_terms_version: pending.terms_version || "unknown"
        }
      });
      payload = await buildSessionPayload(session.user, session.access_token);
    }

    return json(200, { session: payload }, { cookies: sessionCookies(session) });
  } catch (error) {
    if ([400, 401].includes(error.statusCode)) return json(401, { error: "Email or password was not accepted." });
    return safeError(error);
  }
}
