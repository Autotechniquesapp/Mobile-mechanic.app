import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const allowedPlans = new Set(['solo','shop','pro_fleet']);
const allowedStatuses = new Set(['trialing','active','past_due','suspended','comped','canceled']);

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authorization = req.headers.get('Authorization') ?? '';
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = String(body.action ?? 'status');

  const { data: adminRow } = await admin.from('platform_admins').select('user_id,role,display_name,active').eq('user_id', user.id).maybeSingle();
  const role = adminRow?.active ? String(adminRow.role) : null;

  const log = async (name: string, shopId: string | null, details: Record<string, unknown> = {}) => {
    await admin.from('admin_activity_log').insert({ actor_user_id: user.id, actor_role: role ?? 'platform_owner', affected_shop_id: shopId, action: name, details });
  };

  if (action === 'bootstrap') {
    const { count } = await admin.from('platform_admins').select('user_id', { count: 'exact', head: true }).eq('role','platform_owner').eq('active',true);
    if ((count ?? 0) > 0) return json({ error: 'Platform Owner is already configured.' }, 409);
    const code = String(body.code ?? '').trim();
    if (!code) return json({ error: 'Owner setup code required.' }, 400);
    const { data: bootstrap } = await admin.from('platform_bootstrap').select('id,secret_hash,used_at').eq('id',1).single();
    if (!bootstrap || bootstrap.used_at) return json({ error: 'Owner setup is no longer available.' }, 409);
    if (await sha256Hex(code) !== bootstrap.secret_hash) return json({ error: 'Invalid owner setup code.' }, 403);

    const displayName = String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Platform Owner').slice(0,120);
    const { error: adminError } = await admin.from('platform_admins').insert({ user_id:user.id, role:'platform_owner', display_name:displayName, active:true });
    if (adminError) return json({ error: adminError.message }, 400);

    await admin.from('platform_bootstrap').update({ used_at:new Date().toISOString(), used_by:user.id }).eq('id',1);
    await admin.from('admin_activity_log').insert({ actor_user_id:user.id, actor_role:'platform_owner', affected_shop_id:null, action:'platform_owner_bootstrap', details:{ scope:'platform_only' } });
    return json({ ok:true, role:'platform_owner' });
  }

  const { data: bootstrapState } = await admin.from('platform_bootstrap').select('used_at').eq('id',1).maybeSingle();
  if (action === 'status') {
    let myShop = null;
    const { data: membership } = await admin.from('shop_members').select('shop_id,role,status').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();
    if (membership) {
      const { data: shop } = await admin.from('shops').select('shop_id,slug,name').eq('shop_id',membership.shop_id).maybeSingle();
      myShop = shop;
    }
    return json({ ok:true, is_admin:!!role, role, bootstrap_available:!bootstrapState?.used_at, my_shop:myShop });
  }

  if (!role) return json({ error: 'Platform admin access required.' }, 403);

  if (action === 'overview') {
    const [{ data: shops, error: shopsError }, { data: plans }, { data: members }, { data: activity }] = await Promise.all([
      admin.from('shops').select('shop_id,slug,name,plan,billing_status,trial_started_at,trial_expires_at,created_at,referred_by_name,referral_code,comped_at,comped_permanent').order('created_at',{ascending:false}),
      admin.from('plan_catalog').select('code,name,monthly_price,included_seats').eq('active',true),
      admin.from('shop_members').select('shop_id,user_id,status'),
      admin.from('admin_activity_log').select('id,actor_user_id,actor_role,affected_shop_id,action,details,created_at').order('created_at',{ascending:false}).limit(50)
    ]);
    if (shopsError) return json({ error: shopsError.message }, 400);
    const priceMap = new Map((plans ?? []).map((p:any) => [p.code, Number(p.monthly_price || 0)]));
    const memberCounts = new Map<string,number>();
    for (const m of members ?? []) if (m.status === 'active') memberCounts.set(m.shop_id, (memberCounts.get(m.shop_id) ?? 0) + 1);
    const rows = (shops ?? []).map((s:any) => ({ ...s, active_members:memberCounts.get(s.shop_id) ?? 0, monthly_price:priceMap.get(s.plan) ?? 0 }));
    const paid = rows.filter((s:any) => s.billing_status === 'active');
    const metrics = {
      total_shops: rows.length,
      trialing: rows.filter((s:any)=>s.billing_status==='trialing').length,
      paying: paid.length,
      comped: rows.filter((s:any)=>s.billing_status==='comped').length,
      past_due: rows.filter((s:any)=>s.billing_status==='past_due').length,
      suspended: rows.filter((s:any)=>s.billing_status==='suspended').length,
      mrr: paid.reduce((sum:number,s:any)=>sum+Number(s.monthly_price||0),0)
    };
    const referrals = new Map<string,{source:string,signups:number,paying:number}>();
    for (const s of rows) {
      const source = String(s.referral_code || s.referred_by_name || '').trim();
      if (!source) continue;
      const r = referrals.get(source) ?? { source, signups:0, paying:0 };
      r.signups += 1; if (s.billing_status === 'active') r.paying += 1; referrals.set(source,r);
    }
    return json({ ok:true, role, metrics, shops:rows, referrals:Array.from(referrals.values()).sort((a,b)=>b.signups-a.signups), activity:activity ?? [] });
  }

  if (role !== 'platform_owner') return json({ error: 'Platform Owner permission required.' }, 403);
  const shopId = String(body.shop_id ?? '');
  if (!shopId) return json({ error: 'shop_id required.' }, 400);

  const { data: existing, error: existingError } = await admin.from('shops').select('shop_id,name,plan,billing_status,trial_expires_at,comped_at,comped_permanent').eq('shop_id',shopId).single();
  if (existingError || !existing) return json({ error: 'Shop not found.' }, 404);
  if (existing.comped_permanent) return json({ error: 'Permanent complimentary shops are protected from platform billing changes.' }, 403);

  let patch: Record<string,unknown> = {};
  if (action === 'extend_trial') {
    const days = Math.min(180, Math.max(1, Number(body.days ?? 30)));
    const base = Math.max(Date.now(), new Date(existing.trial_expires_at).getTime());
    patch = { trial_expires_at:new Date(base + days*86400000).toISOString(), billing_status:'trialing' };
  } else if (action === 'set_plan') {
    const plan = String(body.plan ?? ''); if (!allowedPlans.has(plan)) return json({ error:'Invalid plan.' },400); patch={plan};
  } else if (action === 'set_status') {
    const status = String(body.status ?? ''); if (!allowedStatuses.has(status)) return json({ error:'Invalid status.' },400); patch={billing_status:status};
  } else {
    return json({ error:'Unknown action.' },400);
  }

  const { data: updated, error: updateError } = await admin.from('shops').update(patch).eq('shop_id',shopId).select('shop_id,name,plan,billing_status,trial_expires_at,comped_at,comped_permanent').single();
  if (updateError) return json({ error:updateError.message },400);
  await log(action, shopId, { before:existing, after:updated });
  return json({ ok:true, shop:updated });
});