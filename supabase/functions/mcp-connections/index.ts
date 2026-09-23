import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const PROTOCOL = "2026-07-28";
const APP_ORIGIN = "https://www.mobile-mechanic.app";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function envKey(jsonName: string, legacyName: string) {
  try {
    const parsed = JSON.parse(Deno.env.get(jsonName) || "{}");
    if (parsed?.default) return parsed.default;
  } catch {}
  return Deno.env.get(legacyName) || "";
}
function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomToken(size = 48) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}
async function pkceChallenge(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}
function safeHttps(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("MCP endpoints must use HTTPS.");
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" || h.endsWith(".local") || h === "::1" ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^fc/i.test(h) || /^fd/i.test(h)
  ) throw new Error("Private-network MCP endpoints are not allowed.");
  return u;
}
async function fetchJson(url: string, init: RequestInit = {}) {
  safeHttps(url);
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response: r, body, text };
}
function parseMcpText(text: string, contentType: string) {
  if (contentType.includes("text/event-stream")) {
    const payloads = text.split(/\r?\n/).filter(x => x.startsWith("data:")).map(x => x.slice(5).trim()).filter(Boolean);
    for (let i = payloads.length - 1; i >= 0; i--) {
      try { return JSON.parse(payloads[i]); } catch {}
    }
    throw new Error("MCP server returned an unreadable event stream.");
  }
  try { return JSON.parse(text); } catch { throw new Error("MCP server returned invalid JSON."); }
}
function clientMeta() {
  return { "io.modelcontextprotocol/clientInfo": { name: "Mobile Mechanic AI", version: "1.0" } };
}
async function mcpRequest(serverUrl: string, method: string, params: any, accessToken?: string | null) {
  safeHttps(serverUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL,
    "Mcp-Method": method
  };
  if (method === "tools/call" && params?.name) headers["Mcp-Name"] = String(params.name);
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method,
    params: { ...(params || {}), _meta: clientMeta() }
  });
  const response = await fetch(serverUrl, { method: "POST", headers, body, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  if (response.status === 401) return { unauthorized: true, response, text, data: null };
  if (!response.ok) throw new Error(`MCP server returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  const data = parseMcpText(text, response.headers.get("content-type") || "");
  if (data?.error) throw new Error(data.error?.message || "MCP request failed.");
  return { unauthorized: false, response, text, data };
}
function resourceMetadataFromHeader(value: string | null) {
  if (!value) return "";
  const m = value.match(/resource_metadata="([^"]+)"/i);
  return m?.[1] || "";
}
async function firstJson(candidates: string[]) {
  let last = "";
  for (const raw of [...new Set(candidates.filter(Boolean))]) {
    try {
      const { response, body, text } = await fetchJson(raw, { headers: { Accept: "application/json" } });
      if (response.ok && body && typeof body === "object") return { url: raw, body };
      last = `${response.status} ${text.slice(0, 200)}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`OAuth discovery failed. ${last}`);
}
async function discoverOAuth(serverUrl: string) {
  const u = safeHttps(serverUrl);
  const probe = await mcpRequest(serverUrl, "tools/list", {});
  if (!probe.unauthorized) throw new Error("This MCP server did not request OAuth authorization.");
  const headerUrl = resourceMetadataFromHeader(probe.response.headers.get("www-authenticate"));
  if (headerUrl && new URL(headerUrl).origin !== u.origin) throw new Error("MCP resource metadata must be on the connector host.");
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
  const rm = await firstJson([
    headerUrl,
    `${u.origin}/.well-known/oauth-protected-resource${path}`,
    `${u.origin}/.well-known/oauth-protected-resource`
  ]);
  const authServer = String(rm.body?.authorization_servers?.[0] || rm.body?.authorization_server || "");
  if (!authServer) throw new Error("MCP connector did not advertise an authorization server.");
  const issuer = safeHttps(authServer);
  const issuerPath = issuer.pathname === "/" ? "" : issuer.pathname.replace(/\/$/, "");
  const am = await firstJson([
    `${issuer.origin}/.well-known/oauth-authorization-server${issuerPath}`,
    `${issuer.origin}${issuerPath}/.well-known/oauth-authorization-server`,
    `${issuer.origin}/.well-known/openid-configuration${issuerPath}`,
    `${issuer.origin}${issuerPath}/.well-known/openid-configuration`
  ]);
  const authorizationEndpoint = String(am.body?.authorization_endpoint || "");
  const tokenEndpoint = String(am.body?.token_endpoint || "");
  if (!authorizationEndpoint || !tokenEndpoint) throw new Error("OAuth server metadata is incomplete.");
  safeHttps(authorizationEndpoint);
  safeHttps(tokenEndpoint);
  return {
    resourceMetadataUrl: rm.url,
    resourceMetadata: rm.body,
    authorizationServer: String(am.body?.issuer || authServer),
    authorizationMetadata: am.body,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: String(am.body?.registration_endpoint || "")
  };
}
function functionBase() {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/mcp-connections`;
}
function metadataDocument() {
  const base = functionBase();
  const id = `${base}/client-metadata`;
  return {
    client_id: id,
    client_name: "Mobile Mechanic AI",
    client_uri: `${APP_ORIGIN}/`,
    logo_uri: `${APP_ORIGIN}/app-icon.svg`,
    redirect_uris: [`${base}/callback`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
    policy_uri: `${APP_ORIGIN}/privacy.html`,
    tos_uri: `${APP_ORIGIN}/terms.html`
  };
}
async function registerClient(discovery: any) {
  const metaUrl = `${functionBase()}/client-metadata`;
  if (discovery.authorizationMetadata?.client_id_metadata_document_supported === true) {
    return { client_id: metaUrl, client_secret: null, token_endpoint_auth_method: "none" };
  }
  if (!discovery.registrationEndpoint) throw new Error("This MCP connector does not support a compatible OAuth client registration method.");
  safeHttps(discovery.registrationEndpoint);
  const registration = {
    client_name: "Mobile Mechanic AI",
    client_uri: `${APP_ORIGIN}/`,
    redirect_uris: [`${functionBase()}/callback`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web"
  };
  const { response, body, text } = await fetchJson(discovery.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(registration)
  });
  if (!response.ok || !body?.client_id) throw new Error(`MCP OAuth registration failed: ${text.slice(0, 250)}`);
  return {
    client_id: String(body.client_id),
    client_secret: body.client_secret ? String(body.client_secret) : null,
    token_endpoint_auth_method: String(body.token_endpoint_auth_method || (body.client_secret ? "client_secret_basic" : "none"))
  };
}
function tokenRequestHeaders(clientId: string, clientSecret: string | null, method: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (clientSecret && (method === "client_secret_basic" || !method)) headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  return headers;
}
function addClientSecret(form: URLSearchParams, secret: string | null, method: string | null) {
  if (secret && method === "client_secret_post") form.set("client_secret", secret);
}
function appRedirect(params: Record<string, string>) {
  const u = new URL(`${APP_ORIGIN}/`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  u.hash = "settings";
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const requestUrl = new URL(req.url);
  if (req.method === "GET" && requestUrl.pathname.endsWith("/client-metadata")) {
    return json(metadataDocument());
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const service = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });

  if (req.method === "GET" && requestUrl.pathname.endsWith("/callback")) {
    const state = requestUrl.searchParams.get("state") || "";
    const code = requestUrl.searchParams.get("code") || "";
    const oauthError = requestUrl.searchParams.get("error") || "";
    const returnedIssuer = requestUrl.searchParams.get("iss") || "";
    const { data: pending } = await admin.from("mcp_oauth_states").select("*").eq("state", state).maybeSingle();
    if (!pending || new Date(pending.expires_at).getTime() <= Date.now()) {
      if (state) await admin.from("mcp_oauth_states").delete().eq("state", state);
      return appRedirect({ mcp: "error", message: "MCP authorization expired. Try connecting again." });
    }
    if (oauthError || !code) {
      await admin.from("shop_mcp_connections").upsert({
        shop_id: pending.shop_id, provider: pending.provider, server_url: pending.resource,
        status: "needs_attention", last_error: oauthError || "Authorization was cancelled.", updated_at: new Date().toISOString()
      }, { onConflict: "shop_id,provider" });
      await admin.from("mcp_oauth_states").delete().eq("state", state);
      return appRedirect({ mcp: "error", provider: pending.provider, message: oauthError || "Authorization cancelled." });
    }
    if (returnedIssuer && returnedIssuer !== pending.authorization_server) {
      await admin.from("mcp_oauth_states").delete().eq("state", state);
      return appRedirect({ mcp: "error", provider: pending.provider, message: "Authorization issuer did not match." });
    }
    try {
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: pending.redirect_uri,
        client_id: pending.client_id,
        code_verifier: pending.code_verifier,
        resource: pending.resource
      });
      if (pending.scope) form.set("scope", pending.scope);
      addClientSecret(form, pending.client_secret, pending.token_endpoint_auth_method);
      const { response, body, text } = await fetchJson(pending.token_endpoint, {
        method: "POST",
        headers: tokenRequestHeaders(pending.client_id, pending.client_secret, pending.token_endpoint_auth_method),
        body: form.toString()
      });
      if (!response.ok || !body?.access_token) throw new Error(body?.error_description || body?.error || text.slice(0, 250) || "Token exchange failed.");
      const expiresAt = body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000).toISOString() : null;
      let toolNames: string[] = [];
      let toolError: string | null = null;
      try {
        const check = await mcpRequest(pending.resource, "tools/list", {}, String(body.access_token));
        toolNames = (check.data?.result?.tools || []).map((x: any) => String(x.name || "")).filter(Boolean).slice(0, 150);
      } catch (e) {
        toolError = e instanceof Error ? e.message : String(e);
      }
      await admin.from("shop_mcp_connections").upsert({
        shop_id: pending.shop_id,
        provider: pending.provider,
        server_url: pending.resource,
        status: "connected",
        access_token: String(body.access_token),
        refresh_token: body.refresh_token ? String(body.refresh_token) : null,
        token_expires_at: expiresAt,
        token_type: String(body.token_type || "Bearer"),
        scope: String(body.scope || pending.scope || ""),
        client_id: pending.client_id,
        client_secret: pending.client_secret,
        metadata: {
          authorization_server: pending.authorization_server,
          authorization_endpoint: pending.authorization_endpoint,
          token_endpoint: pending.token_endpoint,
          token_endpoint_auth_method: pending.token_endpoint_auth_method,
          resource: pending.resource,
          tool_names: toolNames
        },
        last_error: toolError,
        last_checked_at: new Date().toISOString(),
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "shop_id,provider" });
      await admin.from("mcp_oauth_states").delete().eq("state", state);
      return appRedirect({ mcp: "connected", provider: pending.provider });
    } catch (e) {
      const message = e instanceof Error ? e.message : "MCP connection failed.";
      await admin.from("shop_mcp_connections").upsert({
        shop_id: pending.shop_id, provider: pending.provider, server_url: pending.resource,
        status: "needs_attention", last_error: message, updated_at: new Date().toISOString()
      }, { onConflict: "shop_id,provider" });
      await admin.from("mcp_oauth_states").delete().eq("state", state);
      return appRedirect({ mcp: "error", provider: pending.provider, message: message.slice(0, 180) });
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Authentication required." }, 401);
  const { data: member } = await admin.from("shop_members").select("shop_id,role,status").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!member) return json({ error: "Active shop membership required." }, 403);
  if (!["shop_owner", "manager"].includes(String(member.role))) return json({ error: "Only a shop owner or manager can manage connected apps." }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");

  const { data: catalogRows, error: catalogError } = await admin.from("mcp_connector_catalog").select("*").eq("enabled", true).order("category").order("display_name");
  if (catalogError) return json({ error: catalogError.message }, 500);

  if (action === "status") {
    const { data: connections } = await admin.from("shop_mcp_connections")
      .select("provider,status,server_url,scope,metadata,last_error,last_checked_at,connected_at")
      .eq("shop_id", member.shop_id);
    const by = Object.fromEntries((connections || []).map((x: any) => [x.provider, x]));
    return json({
      connectors: (catalogRows || []).map((c: any) => ({
        provider: c.provider,
        name: c.display_name,
        category: c.category,
        server_url: c.server_url,
        homepage_url: c.homepage_url,
        trust_label: c.trust_label,
        notes: c.notes,
        status: by[c.provider]?.status || "not_connected",
        last_error: by[c.provider]?.last_error || null,
        last_checked_at: by[c.provider]?.last_checked_at || null,
        connected_at: by[c.provider]?.connected_at || null,
        tool_count: Array.isArray(by[c.provider]?.metadata?.tool_names) ? by[c.provider].metadata.tool_names.length : null
      }))
    });
  }

  const provider = String(body.provider || "");
  const connector: any = (catalogRows || []).find((x: any) => x.provider === provider);
  if (!connector) return json({ error: "Unknown or disabled MCP connector." }, 404);

  if (action === "start") {
    try {
      safeHttps(connector.server_url);
      const discovery = await discoverOAuth(connector.server_url);
      const client = await registerClient(discovery);
      const verifier = randomToken(64);
      const challenge = await pkceChallenge(verifier);
      const state = randomToken(36);
      const redirectUri = `${functionBase()}/callback`;
      const requestedScopes = Array.isArray(connector.requested_scopes) ? connector.requested_scopes.filter(Boolean) : [];
      const scope = requestedScopes.join(" ");
      await admin.from("mcp_oauth_states").delete().lt("expires_at", new Date().toISOString());
      const { error: insertError } = await admin.from("mcp_oauth_states").insert({
        state,
        shop_id: member.shop_id,
        user_id: user.id,
        provider,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: client.client_id,
        client_secret: client.client_secret,
        token_endpoint_auth_method: client.token_endpoint_auth_method,
        authorization_server: discovery.authorizationServer,
        authorization_endpoint: discovery.authorizationEndpoint,
        token_endpoint: discovery.tokenEndpoint,
        resource: connector.server_url,
        scope: scope || null
      });
      if (insertError) throw insertError;
      await admin.from("shop_mcp_connections").upsert({
        shop_id: member.shop_id,
        provider,
        server_url: connector.server_url,
        status: "connecting",
        last_error: null,
        updated_at: new Date().toISOString()
      }, { onConflict: "shop_id,provider" });
      const a = new URL(discovery.authorizationEndpoint);
      a.searchParams.set("response_type", "code");
      a.searchParams.set("client_id", client.client_id);
      a.searchParams.set("redirect_uri", redirectUri);
      a.searchParams.set("code_challenge", challenge);
      a.searchParams.set("code_challenge_method", "S256");
      a.searchParams.set("state", state);
      a.searchParams.set("resource", connector.server_url);
      if (scope) a.searchParams.set("scope", scope);
      return json({ url: a.toString(), provider, name: connector.display_name });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start MCP authorization.";
      await admin.from("shop_mcp_connections").upsert({
        shop_id: member.shop_id, provider, server_url: connector.server_url,
        status: "needs_attention", last_error: message, updated_at: new Date().toISOString()
      }, { onConflict: "shop_id,provider" });
      return json({ error: message }, 502);
    }
  }

  if (action === "disconnect") {
    const { data: current } = await admin.from("shop_mcp_connections").select("*").eq("shop_id", member.shop_id).eq("provider", provider).maybeSingle();
    const revoke = current?.metadata?.revocation_endpoint;
    if (revoke && current?.access_token) {
      try {
        const f = new URLSearchParams({ token: current.access_token, client_id: current.client_id || "" });
        addClientSecret(f, current.client_secret, current?.metadata?.token_endpoint_auth_method || null);
        await fetchJson(String(revoke), {
          method: "POST",
          headers: tokenRequestHeaders(current.client_id || "", current.client_secret || null, current?.metadata?.token_endpoint_auth_method || null),
          body: f.toString()
        });
      } catch {}
    }
    await admin.from("shop_mcp_connections").delete().eq("shop_id", member.shop_id).eq("provider", provider);
    await admin.from("mcp_oauth_states").delete().eq("shop_id", member.shop_id).eq("provider", provider);
    return json({ ok: true });
  }

  if (action === "test") {
    const { data: connection } = await admin.from("shop_mcp_connections").select("*").eq("shop_id", member.shop_id).eq("provider", provider).maybeSingle();
    if (!connection?.access_token) return json({ error: "This MCP connector is not connected." }, 409);
    try {
      let accessToken = String(connection.access_token);
      const exp = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
      if (exp && exp <= Date.now() + 120000) {
        if (!connection.refresh_token) throw new Error("MCP authorization expired. Reconnect the account.");
        const tokenEndpoint = String(connection.metadata?.token_endpoint || "");
        const method = String(connection.metadata?.token_endpoint_auth_method || "none");
        const form = new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: String(connection.refresh_token),
          client_id: String(connection.client_id || ""),
          resource: connector.server_url
        });
        if (connection.scope) form.set("scope", String(connection.scope));
        addClientSecret(form, connection.client_secret, method);
        const { response, body: refreshed, text } = await fetchJson(tokenEndpoint, {
          method: "POST",
          headers: tokenRequestHeaders(String(connection.client_id || ""), connection.client_secret || null, method),
          body: form.toString()
        });
        if (!response.ok || !refreshed?.access_token) throw new Error(refreshed?.error_description || refreshed?.error || text.slice(0, 200) || "Token refresh failed.");
        accessToken = String(refreshed.access_token);
        await admin.from("shop_mcp_connections").update({
          access_token: accessToken,
          refresh_token: refreshed.refresh_token ? String(refreshed.refresh_token) : connection.refresh_token,
          token_expires_at: refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString() : null,
          updated_at: new Date().toISOString()
        }).eq("id", connection.id);
      }
      const check = await mcpRequest(connector.server_url, "tools/list", {}, accessToken);
      const names = (check.data?.result?.tools || []).map((x: any) => String(x.name || "")).filter(Boolean).slice(0, 150);
      await admin.from("shop_mcp_connections").update({
        status: "connected",
        last_error: null,
        last_checked_at: new Date().toISOString(),
        metadata: { ...(connection.metadata || {}), tool_names: names },
        updated_at: new Date().toISOString()
      }).eq("id", connection.id);
      return json({ ok: true, tool_count: names.length, tools: names });
    } catch (e) {
      const message = e instanceof Error ? e.message : "MCP connection check failed.";
      await admin.from("shop_mcp_connections").update({
        status: "needs_attention", last_error: message, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq("id", connection.id);
      return json({ error: message }, 502);
    }
  }

  return json({ error: "Unknown action." }, 400);
});
