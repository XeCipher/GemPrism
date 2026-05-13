import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getModelLimits } from '@/lib/modelLimits';

export const runtime = 'edge';

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const incomingToken = req.headers.get('x-goog-api-key');

  if (!incomingToken) {
    return NextResponse.json({ error: 'Missing Gateway Token' }, { status: 401 });
  }

  // 1. Identify the user from the gateway token
  const { data: tokenData } = await supabaseAdmin
    .from('gateway_tokens')
    .select('user_id')
    .eq('token', incomingToken)
    .single();

  if (!tokenData) {
    return NextResponse.json({ error: 'Invalid Gateway Token' }, { status: 401 });
  }
  const userId = tokenData.user_id;

  // 2. Resolve the target path and extract the model name
  const resolvedParams = await params;
  const urlPath = resolvedParams.path.join('/');

  let requestedModel = 'default';
  const modelMatch = urlPath.match(/models\/([^:]+)/);
  if (modelMatch) requestedModel = modelMatch[1];

  // Resolve Canonical Model Name for accurate tracking & limits
  const modelLimits = getModelLimits(requestedModel);
  const modelName = modelLimits.id; 

  if (modelLimits.rpd === 0) {
    return NextResponse.json(
      { error: `Model ${modelName} is waitlisted or unavailable.` },
      { status: 403 }
    );
  }

  // 3. Fetch the user's keys and current model-specific usage in parallel
  const [keysReq, usageReq] = await Promise.all([
    supabaseAdmin.from('api_keys').select('*').eq('user_id', userId),
    supabaseAdmin
      .from('model_usage')
      .select('*')
      .eq('user_id', userId)
      .eq('model_name', modelName),
  ]);

  const keys   = keysReq.data  ||[];
  const usages = usageReq.data ||[];

  if (keys.length === 0) {
    return NextResponse.json(
      { error: 'No API keys have been added to this Gateway account.' },
      { status: 400 }
    );
  }

  const now      = Date.now();
  const todayStr = new Date().toISOString().split('T')[0];

  // 4. Build a usage map keyed by api_key_id, resetting stale time windows
  const usageMap = new Map<string, { rpd: number; rpm: number }>();
  usages.forEach(u => {
    const rpd = u.rpd_date === todayStr ? (u.rpd_count || 0) : 0;
    const rpm = now - (u.rpm_window_start || 0) <= 60_000 ? (u.rpm_count || 0) : 0;
    usageMap.set(u.api_key_id, { rpd, rpm });
  });

  // 5. Hydrate keys — lazily recover cooled-down keys and attach model usage
  const hydratedKeys = keys.map(key => {
    let mutated = false;

    if (key.status === 'cooling' && now > (key.cooldown_until || 0)) {
      key.status = 'healthy';
      mutated    = true;
    }

    const modelStats = usageMap.get(key.id) || { rpd: 0, rpm: 0 };

    return { ...key, mutated, model_rpd: modelStats.rpd, model_rpm: modelStats.rpm };
  });

  // Sort healthy keys by lowest usage first (least-loaded routing)
  const availableKeys = hydratedKeys
    .filter(k => k.status === 'healthy' && k.model_rpm < modelLimits.rpm && k.model_rpd < modelLimits.rpd)
    .sort((a, b) =>
      a.model_rpd !== b.model_rpd ? a.model_rpd - b.model_rpd : a.model_rpm - b.model_rpm
    );

  if (availableKeys.length === 0) {
    return NextResponse.json(
      { error: `All API keys are exhausted or cooling for model: ${modelName}` },
      { status: 503 }
    );
  }

  const payload = await req.text();

  // 6. Gateway traversal — try keys in order, skipping on rate-limit or auth errors
  for (const key of availableKeys) {
    try {
      // NOTE: We pass the exact urlPath upstream so aliases like gemini-flash-latest still work natively on Google
      const targetUrl = `https://generativelanguage.googleapis.com/${urlPath}?key=${key.key_value}`;

      const response = await fetch(targetUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    payload,
      });

      if (response.status === 429) {
        await updateKeyState(key.id, {
          status:         'cooling',
          cooldown_until: now + 90_000,
          total_errors:   (key.total_errors || 0) + 1,
          last_error:     `429 Rate Limited on model ${modelName}`,
        });
        continue;
      }

      if (response.status === 403) {
        await updateKeyState(key.id, {
          status:       'dead',
          total_errors: (key.total_errors || 0) + 1,
          last_error:   'API Key Invalid (403)',
        });
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json();
        return NextResponse.json(errorData, { status: response.status });
      }

      const data = await response.json();

      await Promise.all([
        updateKeyState(key.id, {
          total_requests: (key.total_requests || 0) + 1,
          last_used:      now,
          ...(key.mutated ? { status: 'healthy' } : {}),
        }),
        recordModelUsage(
          userId,
          key.id,
          modelName, // We record usage under the clean canonical modelName
          key.model_rpd + 1,
          key.model_rpm + 1,
          todayStr,
          now
        ),
      ]);

      return NextResponse.json(data, { status: 200 });

    } catch (err: any) {
      await updateKeyState(key.id, {
        total_errors: (key.total_errors || 0) + 1,
        last_error:   err?.message || 'Unknown network error',
      });
    }
  }

  return NextResponse.json(
    { error: 'All available keys failed to process the request.' },
    { status: 502 }
  );
}

// ─── Database Helpers ─────────────────────────────────────────────────────────

async function updateKeyState(id: string, updates: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('api_keys').update(updates).eq('id', id);
  if (error) {
    console.error('[GemPrism] updateKeyState failed:', error.message);
  }
}

async function recordModelUsage(
  userId:    string,
  apiKeyId:  string,
  modelName: string,
  rpd:       number,
  rpm:       number,
  todayStr:  string,
  now:       number
) {
  const { error } = await supabaseAdmin.from('model_usage').upsert(
    {
      user_id:          userId,
      api_key_id:       apiKeyId,
      model_name:       modelName,
      rpd_count:        rpd,
      rpm_count:        rpm,
      rpd_date:         todayStr,
      rpm_window_start: now,
    },
    { onConflict: 'api_key_id,model_name' }
  );

  if (error) {
    console.error('[GemPrism] recordModelUsage failed:', error.message, error.details);
  }
}