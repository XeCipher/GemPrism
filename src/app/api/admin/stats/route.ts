import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { fetchAvailableModels } from '@/lib/modelLimits';

export const runtime = 'nodejs';
export const maxDuration = 300; 

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();

    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userAuth, error } = await supabaseAdmin.auth.getUser(authHeader);
    if (error || !userAuth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = userAuth.user.id;

    const [tokenReq, keysReq, usageReq] = await Promise.all([
      supabaseAdmin.from('gateway_tokens').select('token').eq('user_id', userId).single(),
      supabaseAdmin.from('api_keys').select('*').eq('user_id', userId),
      supabaseAdmin.from('model_usage').select('*').eq('user_id', userId)
    ]);

    let userToken = tokenReq.data?.token;
    if (!userToken) {
      userToken = `gp_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
      await supabaseAdmin.from('gateway_tokens').insert({ user_id: userId, token: userToken });
    }

    const keys = (keysReq.data || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const modelUsage = usageReq.data || [];

    // Keys are now either healthy or dead
    const hydratedKeys = keys.map(k => ({
      ...k,
      status: k.status === 'cooling' ? 'healthy' : k.status
    }));

    const activeKeys = hydratedKeys.filter(k => k.status !== 'dead');
    let dynamicModels: string[] = [];
    if (activeKeys.length > 0) {
      dynamicModels = await fetchAvailableModels(activeKeys[0].key_value);
    } else {
      dynamicModels = await fetchAvailableModels('');
    }

    const modelsObj: Record<string, any> = {};
    dynamicModels.forEach(m => {
      modelsObj[m] = { name: m }; // Strip arbitrary models limits, sending pure mapped models
    });

    return NextResponse.json({
      token: userToken,
      keys: hydratedKeys.map(k => ({ 
        ...k, 
        key_value: `${k.key_value.slice(0, 6)}••••••••${k.key_value.slice(-4)}` 
      })),
      models: modelsObj,
      usage: modelUsage,
      summary: {
        total_requests: hydratedKeys.reduce((acc, k) => acc + (k.total_requests || 0), 0),
        active: hydratedKeys.filter(k => k.status !== 'dead').length,
        dead: hydratedKeys.filter(k => k.status === 'dead').length,
        total_keys: hydratedKeys.length
      }
    });

  } catch (err: any) {
    console.error('[GemPrism Admin Stats Error]:', err.message);
    return NextResponse.json({ error: 'Server configuration error.', message: err.message }, { status: 500 });
  }
}