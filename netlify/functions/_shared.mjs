const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function env(name) {
  return String(process.env[name] || "").trim();
}

function supabaseEnv(name) {
  if (name === "SUPABASE_URL") return env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  if (name === "SUPABASE_ANON_KEY") return env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  return env(name);
}

export function isSupabaseConfigured({ service = false } = {}) {
  return Boolean(supabaseEnv("SUPABASE_URL") && supabaseEnv(service ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY"));
}

export function json(statusCode, body, { headers = {}, cookies = [] } = {}) {
  const response = {
    statusCode,
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body)
  };
  if (cookies.length) response.multiValueHeaders = { "Set-Cookie": cookies };
  return response;
}

export function methodNotAllowed(allowed) {
  return json(405, { error: "Method not allowed." }, { headers: { Allow: allowed.join(", ") } });
}

export function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 });
  }
}

export function cleanText(value, max = 500) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function cleanSlug(value) {
  const slug = cleanText(value, 40).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

export function parseCookies(event) {
  const source = event.headers?.cookie || event.headers?.Cookie || "";
  return source.split(";").reduce((result, pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return result;
    result[decodeURIComponent(pair.slice(0, index).trim())] = decodeURIComponent(pair.slice(index + 1).trim());
    return result;
  }, {});
}

function cookie(name, value, maxAge) {
  const secure = env("COOKIE_SECURE").toLowerCase() !== "false";
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`
  ].filter(Boolean).join("; ");
}

export function sessionCookies(session) {
  const accessMax = Math.max(60, Number(session.expires_in || 3600) - 30);
  return [
    cookie("mmi_at", session.access_token, accessMax),
    cookie("mmi_rt", session.refresh_token, 60 * 60 * 24 * 30)
  ];
}

export function clearedSessionCookies() {
  return [cookie("mmi_at", "", 0), cookie("mmi_rt", "", 0)];
}

function supabaseBase() {
  return supabaseEnv("SUPABASE_URL").replace(/\/+$/, "");
}

export async function supabaseRequest(path, { method = "GET", body, token, service = false, headers = {} } = {}) {
  if (!isSupabaseConfigured({ service })) {
    throw Object.assign(new Error("Secure Supabase backend is not connected."), { statusCode: 503 });
  }
  const apiKey = supabaseEnv(service ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY");
  const response = await fetch(`${supabaseBase()}${path}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token || apiKey}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || "Backend request failed.";
    throw Object.assign(new Error(message), { statusCode: response.status, details: data });
  }
  return data;
}

async function fetchUser(accessToken) {
  return supabaseRequest("/auth/v1/user", { token: accessToken });
}

export async function resolveSession(event) {
  const cookies = parseCookies(event);
  let accessToken = cookies.mmi_at || "";
  let refreshToken = cookies.mmi_rt || "";
  let user = null;
  let refreshedSession = null;

  if (accessToken) {
    try {
      user = await fetchUser(accessToken);
    } catch (error) {
      if (![401, 403].includes(error.statusCode)) throw error;
    }
  }

  if (!user && refreshToken) {
    try {
      refreshedSession = await supabaseRequest("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: refreshToken }
      });
      accessToken = refreshedSession.access_token;
      refreshToken = refreshedSession.refresh_token;
      user = refreshedSession.user || await fetchUser(accessToken);
    } catch {
      user = null;
    }
  }

  if (!user || !accessToken) {
    throw Object.assign(new Error("Sign in is required."), { statusCode: 401 });
  }

  return {
    user,
    accessToken,
    refreshToken,
    responseCookies: refreshedSession ? sessionCookies(refreshedSession) : []
  };
}

export async function getMemberships(userId, accessToken) {
  const query = new URLSearchParams({
    select: "shop_id,role,status,shops(id,name,slug,plan,trial_start,trial_end,billing_status,status)",
    user_id: `eq.${userId}`,
    status: "eq.active"
  });
  return supabaseRequest(`/rest/v1/shop_members?${query}`, { token: accessToken });
}

export async function buildSessionPayload(user, accessToken) {
  const memberships = await getMemberships(user.id, accessToken);
  const normalized = memberships.map((membership) => ({
    shopId: membership.shop_id,
    role: membership.role,
    status: membership.status,
    shop: membership.shops ? {
      ...membership.shops,
      trialDaysRemaining: trialDaysRemaining(membership.shops.trial_end)
    } : null
  }));
  let platformRole = null;
  try {
    const query = new URLSearchParams({
      select: "role,status",
      user_id: `eq.${user.id}`,
      status: "eq.active",
      limit: "1"
    });
    const admins = await supabaseRequest(`/rest/v1/platform_admins?${query}`, { token: accessToken });
    platformRole = admins?.[0]?.role || null;
  } catch {
    platformRole = null;
  }
  return {
    user: { id: user.id, email: user.email, name: user.user_metadata?.owner_name || user.user_metadata?.name || "" },
    memberships: normalized,
    activeShop: normalized[0]?.shop ? { ...normalized[0].shop, role: normalized[0].role } : null,
    platformRole,
    integrations: {
      supabase: isSupabaseConfigured(),
      openai: Boolean(env("OPENAI_API_KEY")),
      stripe: Boolean(env("STRIPE_SECRET_KEY")),
      carfax: Boolean(env("CARFAX_API_KEY")),
      sms: Boolean(env("SMS_API_KEY"))
    }
  };
}

export async function requireShopMember(event, shopId, roles = []) {
  const session = await resolveSession(event);
  const memberships = await getMemberships(session.user.id, session.accessToken);
  const membership = memberships.find((item) => item.shop_id === shopId);
  if (!membership) throw Object.assign(new Error("You do not have access to this shop."), { statusCode: 403 });
  if (roles.length && !roles.includes(membership.role)) {
    throw Object.assign(new Error("Your shop role cannot perform this action."), { statusCode: 403 });
  }
  return { ...session, membership, memberships };
}

export function trialDaysRemaining(trialEnd) {
  if (!trialEnd) return 60;
  return Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86400000));
}

export function safeError(error) {
  const statusCode = Number(error?.statusCode || 500);
  const publicMessage = statusCode >= 500 && statusCode !== 503
    ? "The secure service could not complete this request."
    : cleanText(error?.message || "Request failed.", 300);
  return json(statusCode, { error: publicMessage });
}
