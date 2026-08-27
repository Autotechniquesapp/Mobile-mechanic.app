import { buildSessionPayload, json, methodNotAllowed, resolveSession, safeError } from "./_shared.mjs";

export async function handler(event) {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  try {
    const session = await resolveSession(event);
    const payload = await buildSessionPayload(session.user, session.accessToken);
    return json(200, payload, { cookies: session.responseCookies });
  } catch (error) {
    return safeError(error);
  }
}
