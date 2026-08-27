import {
  cleanEmail,
  cleanText,
  json,
  methodNotAllowed,
  parseBody,
  requireShopMember,
  safeError,
  supabaseRequest
} from "./_shared.mjs";

const roles = new Set(["manager", "technician", "service_writer"]);
const seatLimits = { solo: 1, shop: 5, pro: 15 };

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  try {
    const body = parseBody(event);
    const shopId = cleanText(body.shopId, 80);
    const name = cleanText(body.name, 120);
    const email = cleanEmail(body.email);
    const role = roles.has(body.role) ? body.role : "technician";
    if (!shopId || !name || !email) return json(400, { error: "Technician name, email, and shop are required." });
    const session = await requireShopMember(event, shopId, ["shop_owner", "manager"]);
    const shop = session.membership.shops || {};
    const limit = seatLimits[shop.plan] || 1;
    const members = await supabaseRequest(`/rest/v1/shop_members?select=user_id&shop_id=eq.${encodeURIComponent(shopId)}&status=eq.active`, {
      token: session.accessToken
    });
    if (members.length >= limit) return json(409, { error: `This ${shop.plan || "current"} plan has reached its included ${limit}-user limit.` });

    await supabaseRequest(`/rest/v1/shop_invitations?shop_id=eq.${encodeURIComponent(shopId)}&email=eq.${encodeURIComponent(email)}&status=eq.sent`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: { status: "revoked" }
    });

    const invitationRows = await supabaseRequest("/rest/v1/shop_invitations?select=id", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=representation" },
      body: {
        shop_id: shopId,
        email,
        name,
        role,
        invited_by: session.user.id,
        status: "sent"
      }
    });
    const invitationId = Array.isArray(invitationRows) ? invitationRows[0]?.id : invitationRows?.id;

    try {
      await supabaseRequest("/auth/v1/invite", {
        method: "POST",
        service: true,
        body: {
          email,
          data: {
            name,
            invited_shop_id: shopId
          },
          redirect_to: `${String(process.env.APP_ORIGIN || "https://mobile-mechanic.app").replace(/\/+$/, "")}/`
        }
      });
    } catch (error) {
      if (invitationId) {
        await supabaseRequest(`/rest/v1/shop_invitations?id=eq.${encodeURIComponent(invitationId)}`, {
          method: "PATCH",
          service: true,
          headers: { Prefer: "return=minimal" },
          body: { status: "revoked" }
        }).catch(() => {});
      }
      throw error;
    }
    return json(201, { invited: true }, { cookies: session.responseCookies });
  } catch (error) {
    return safeError(error);
  }
}
