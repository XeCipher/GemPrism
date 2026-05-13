import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getModelLimits } from '@/lib/modelLimits';

export const runtime = 'edge';

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const incomingToken = req.headers.get('x-goog-api-key');
  
  if (!incomingToken) return NextResponse.json({ error: 'Missing Gateway Token' }, { status: 401 });

  // 1. Identify User from Token
  const { data: tokenData } = await supabaseAdmin
    .from('gateway_tokens')
    .select('user_id')
    .eq('token', incomingToken)
    .single();

  if (!tokenData) return NextResponse.json({ error: 'Invalid Gateway Token' }, { status: 401 });
  const userId = tokenData.user_id;

  // 2. Resolve Path and Limits
  const resolvedParams = await params;
  const urlPath = resolvedParams.path.join('/');
  
  let modelName = 'default';
  const modelMatch = urlPath.match(/models\/([^:]+)/);
  if (modelMatch) modelName = modelMatch[1];
  
  const limits = getModelLimits(modelName);
  if (limits.rpd === 0) {
    return NextResponse.json({ error: `Model ${modelName} is waitlisted or unavailable.` }, { status: 403 });
  }

  // 3. Fetch User's Keys & Model-Specific Usage
  const [keysReq, usageReq] = await Promise.all([
    supabaseAdmin.from('api_keys').select('*').eq('user_id', userId),
    supabaseAdmin.from('model_usage').select('*').eq('user_id', userId).eq('model_name', modelName)
  ]);

  const keys = keysReq.data || [];
  const usages = usageReq.data ||[];

  if (keys.length === 0) {
    return NextResponse.json({ error: 'No API keys have been added to this Gateway account.' }, { status: 400 });
  }

  const now = Date.now();
  const todayStr = new Date().toISOString().split('T')[0];

  // 4. Hydrate Model Usage (Reset counters if time has passed)
  const usageMap = new Map();
  usages.forEach(u => {
    let rpd = u.rpd_count;
    let rpm = u.rpm_count;
    if (u.rpd_date !== todayStr) rpd = 0;
    if (now - u.rpm_window_start > 60000) rpm = 0;
    usageMap.set(u.api_key_id, { rpd, rpm });
  });

  // 5. Hydrate Keys and Lazy Evaluate status
  const hydratedKeys = keys.map(key => {
    let mutated = false;
    // Check if key recovered from being 429 rate limited
    if (key.status === 'cooling' && now > key.cooldown_until) {
      key.status = 'healthy'; 
      mutated = true;
    }
    
    // Get this specific model's usage for this key
    const modelStats = usageMap.get(key.id) || { rpd: 0, rpm: 0 };

    return { 
      ...key, 
      mutated, 
      model_rpd: modelStats.rpd, 
      model_rpm: modelStats.rpm 
    };
  });

  // Filter keys by MODEL limits (not global limits) & Sort by lowest usage
  const availableKeys = hydratedKeys
    .filter(k => k.status === 'healthy' && k.model_rpm < limits.rpm && k.model_rpd < limits.rpd)
    .sort((a, b) => a.model_rpd !== b.model_rpd ? a.model_rpd - b.model_rpd : a.model_rpm - b.model_rpm);

  if (availableKeys.length === 0) {
    return NextResponse.json({ error: `All API keys are exhausted or cooling for the model: ${modelName}` }, { status: 503 });
  }

  const payload = await req.text();

  // 6. Gateway Traversal
  for (const key of availableKeys) {
    try {
      const targetUrl = `https://generativelanguage.googleapis.com/${urlPath}?key=${key.key_value}`;
      
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (response.status === 429) {
        // If one model 429s, it's safe to cool the whole key temporarily
        await updateKeyState(key.id, { 
          status: 'cooling', cooldown_until: now + 90000, 
          total_errors: key.total_errors + 1, last_error: `429 Rate Limited on model ${modelName}`
        });
        continue; // Try next key
      }

      if (response.status === 403) {
        await updateKeyState(key.id, { 
          status: 'dead', total_errors: key.total_errors + 1, last_error: 'API Key Invalid (403)' 
        });
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json();
        return NextResponse.json(errorData, { status: response.status });
      }

      // Success! Update global key stats and exact model usage asynchronously
      const data = await response.json();
      
      Promise.all([
        updateKeyState(key.id, {
          total_requests: key.total_requests + 1,
          last_used: now,
          status: key.status // in case it recovered from cooling
        }),
        recordExactModelUsage(userId, key.id, modelName, key.model_rpd + 1, key.model_rpm + 1, todayStr, now)
      ]).catch(console.error);

      return NextResponse.json(data, { status: 200 });

    } catch (err: any) {
      await updateKeyState(key.id, { total_errors: key.total_errors + 1, last_error: err.message });
    }
  }

  return NextResponse.json({ error: 'All available keys failed to process the request.' }, { status: 502 });
}

// Database Helpers
async function updateKeyState(id: string, updates: any) {
  await supabaseAdmin.from('api_keys').update(updates).eq('id', id);
}

async function recordExactModelUsage(userId: string, apiKeyId: string, modelName: string, rpd: number, rpm: number, todayStr: string, now: number) {
  const { data } = await supabaseAdmin.from('model_usage')
    .select('id')
    .eq('api_key_id', apiKeyId)
    .eq('model_name', modelName)
    .single();

  if (data) {
    await supabaseAdmin.from('model_usage')
      .update({ rpd_count: rpd, rpm_count: rpm, rpd_date: todayStr, rpm_window_start: now })
      .eq('id', data.id);
  } else {
    await supabaseAdmin.from('model_usage')
      .insert({ user_id: userId, api_key_id: apiKeyId, model_name: modelName, rpd_count: rpd, rpm_count: rpm, rpd_date: todayStr, rpm_window_start: now });
  }
}