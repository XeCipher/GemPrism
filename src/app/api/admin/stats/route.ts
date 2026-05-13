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

  // Fetch Token, Keys, and Model Usage
  const [tokenReq, keysReq, usageReq] = await Promise.all([
    supabaseAdmin.from('gateway_tokens').select('token').eq('user_id', userId).single(),
    // Removed the problematic .order() clause that causes silent DB failures if the column is missing
    supabaseAdmin.from('api_keys').select('*').eq('user_id', userId),
    supabaseAdmin.from('model_usage').select('*').eq('user_id', userId)
  ]);

  // If user just signed up and verified email, they won't have a token yet. Generate it now.
  let userToken = tokenReq.data?.token;
  if (!userToken) {
    userToken = `gp_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    await supabaseAdmin.from('gateway_tokens').insert({ user_id: userId, token: userToken });
  }

  // Sort keys alphabetically by name in Javascript to bypass any missing DB schema columns
  const keys = (keysReq.data ||[]).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const modelUsage = usageReq.data ||[];

  return NextResponse.json({
    token: userToken,
    // Mask key safely but leave enough to recognize if unnamed
    keys: keys.map(k => ({ 
      ...k, 
      key_value: `${k.key_value.slice(0, 6)}••••••••${k.key_value.slice(-4)}` 
    })),
    models: ALL_MODELS,
    usage: modelUsage,
    summary: {
      total_requests: keys.reduce((acc, k) => acc + (k.total_requests || 0), 0),
      active: keys.filter(k => k.status === 'healthy').length,
      cooling: keys.filter(k => k.status === 'cooling').length,
      dead: keys.filter(k => k.status === 'dead').length,
    }
  });
}