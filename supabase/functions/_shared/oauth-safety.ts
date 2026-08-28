const APP_ORIGIN = "https://mobile-mechanic.app";
export const DEFAULT_RETURN = `${APP_ORIGIN}/#settings`;

export function safeReturn(value: string | null): string {
  try {
    const url = new URL(value || "");
    if (url.origin === APP_ORIGIN && !url.username && !url.password) return url.href;
  } catch {}
  return DEFAULT_RETURN;
}

export async function checked(query: any) {
  const result = await query;
  if (result.error) throw new Error("Could not save or read integration settings. Please retry.");
  return result.data;
}

export async function claimState(admin: any, table: string, provider: string, state: string) {
  if (!state) return null;
  const now = new Date().toISOString();
  // Claim once in PostgreSQL, so concurrent callbacks cannot both exchange tokens.
  const row = await checked(admin.from(table).update({ consumed_at: now })
    .eq("state_token", state).eq("provider", provider)
    .is("consumed_at", null).gt("expires_at", now).select("*").maybeSingle());
  if (!row) return null;
  const member = await checked(admin.from("shop_members").select("role")
    .eq("shop_id", row.shop_id).eq("user_id", row.user_id)
    .eq("status", "active").maybeSingle());
  return member && ["shop_owner", "owner", "manager"].includes(member.role) ? row : null;
}
