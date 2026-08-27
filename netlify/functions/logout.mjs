import { clearedSessionCookies, json, methodNotAllowed } from "./_shared.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  return json(200, { signedOut: true }, { cookies: clearedSessionCookies() });
}
