import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ALL_MODELS } from '@/lib/modelLimits';

export const runtime = 'edge';

export async function GET(req: Request) {
  // Client will pass token in Authorization header
  const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userAuth, error } = await supabaseAdmin.auth.getUser(authHeader);
  if (error || !userAuth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = userAuth.user.id;

  // Fetch Token, Keys, and Usage
  let [tokenReq, keysReq, usageReq] = await Promise.all([
    supabaseAdmin.from('gateway_tokens').select('token').eq('user_id', userId).single(),
    supabaseAdmin.from('api_keys').select('*').eq('user_id', userId),
    supabaseAdmin.from('model_usage').select('*').eq('user_id', userId)
  ]);

  // If user just signed up and verified email, they won't have a token yet. Generate it now!
  let userToken = tokenReq.data?.token;
  if (!userToken) {
    userToken = `gp_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    await supabaseAdmin.from('gateway_tokens').insert({ user_id: userId, token: userToken });
  }

  const keys = keysReq.data ||[];
  
  // Format usage as a map { "gemini-2.5-flash": 120 }
  const usageMap: Record<string, number> = {};
  usageReq.data?.forEach(u => usageMap[u.model_name] = u.usage_count);

  return NextResponse.json({
    token: userToken,
    keys: keys.map(k => ({ ...k, key_value: `•••${k.key_value.slice(-4)}` })), // mask key
    models: ALL_MODELS,
    usage: usageMap,
    summary: {
      total_requests: keys.reduce((acc, k) => acc + k.rpd_count, 0),
      active: keys.filter(k => k.status === 'healthy').length,
      cooling: keys.filter(k => k.status === 'cooling').length,
      dead: keys.filter(k => k.status === 'dead').length,
      rpm_total: keys.reduce((acc, k) => acc + k.rpm_count, 0)
    }
  });
}