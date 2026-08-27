import { cleanSlug, json, methodNotAllowed, safeError, supabaseRequest } from "./_shared.mjs";

export async function handler(event) {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  try {
    const slug = cleanSlug(event.queryStringParameters?.slug);
    if (!slug) return json(400, { error: "Invalid shop link." });
    const rows = await supabaseRequest("/rest/v1/rpc/public_shop_by_slug", {
      method: "POST",
      body: { p_slug: slug }
    });
    const shop = Array.isArray(rows) ? rows[0] : rows;
    if (!shop) return json(404, { error: "Shop intake link was not found." });
    return json(200, {
      shop: {
        name: shop.name,
        slug: shop.slug,
        phone: shop.phone,
        logoUrl: shop.logo_url || null,
        serviceArea: shop.service_area || ""
      }
    });
  } catch (error) {
    return safeError(error);
  }
}
