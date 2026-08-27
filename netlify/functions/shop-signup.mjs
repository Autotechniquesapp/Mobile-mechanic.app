import {
  buildSessionPayload,
  cleanEmail,
  cleanSlug,
  cleanText,
  json,
  methodNotAllowed,
  parseBody,
  safeError,
  sessionCookies,
  supabaseRequest
} from "./_shared.mjs";

const allowedPlans = new Set(["solo", "shop", "pro"]);

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  try {
    const body = parseBody(event);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    const shopName = cleanText(body.shopName, 120);
    const ownerName = cleanText(body.ownerName, 120);
    const slug = cleanSlug(body.slug);
    const phone = cleanText(body.phone, 40);
    const address = cleanText(body.address, 240);
    const serviceArea = cleanText(body.serviceArea, 180);
    const plan = allowedPlans.has(body.plan) ? body.plan : "solo";
    const laborRate = Number(body.laborRate);
    const taxRate = Number(body.taxRate);
    const serviceCallFee = Number(body.serviceCallFee || 0);
    const partsMarkup = Number(body.partsMarkup || 0);
    const termsVersion = cleanText(body.termsVersion, 40);

    if (!email || password.length < 10 || !shopName || !ownerName || !slug || !phone || !address || !serviceArea) {
      return json(400, { error: "Complete all required shop and owner fields. Password must be at least 10 characters." });
    }
    if (![laborRate, taxRate, serviceCallFee, partsMarkup].every(Number.isFinite)) {
      return json(400, { error: "Labor, tax, service-call, and markup settings must be valid numbers." });
    }

    const auth = await supabaseRequest("/auth/v1/signup", {
      method: "POST",
      body: {
        email,
        password,
        data: {
          owner_name: ownerName,
          pending_shop: {
            name: shopName,
            slug,
            phone,
            address,
            service_area: serviceArea,
            plan,
            labor_rate: laborRate,
            tax_rate: taxRate,
            service_call_fee: serviceCallFee,
            parts_markup: partsMarkup,
            terms_version: termsVersion,
            terms_accepted_at: cleanText(body.termsAcceptedAt, 60)
          }
        }
      }
    });

    if (!auth.session && !auth.access_token) {
      return json(202, { requiresEmailConfirmation: true });
    }

    const session = auth.session || auth;
    await supabaseRequest("/rest/v1/rpc/bootstrap_shop", {
      method: "POST",
      token: session.access_token,
      body: {
        p_name: shopName,
        p_slug: slug,
        p_phone: phone,
        p_address: address,
        p_service_area: serviceArea,
        p_plan: plan,
        p_labor_rate: laborRate,
        p_tax_rate: taxRate,
        p_service_call_fee: serviceCallFee,
        p_parts_markup: partsMarkup,
        p_terms_version: termsVersion
      }
    });

    const payload = await buildSessionPayload(session.user || auth.user, session.access_token);
    return json(201, { session: payload }, { cookies: sessionCookies(session) });
  } catch (error) {
    if (String(error.message).toLowerCase().includes("slug")) return json(409, { error: "That shop slug is already in use. Choose another." });
    return safeError(error);
  }
}
