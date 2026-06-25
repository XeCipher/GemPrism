import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { getModelLimits, getQuotaResetDateStr } from '@/lib/modelLimits';

export const runtime = 'nodejs';
export const maxDuration = 300; 

export async function handler(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  // 1. Handle Preflight safely
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200 });
  }

  const reqUrl = new URL(req.url);

  // 2. Token Extraction
  let incomingToken = req.headers.get('x-goog-api-key') || reqUrl.searchParams.get('key');
  if (!incomingToken) {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) incomingToken = auth.split(' ')[1];
  }

  if (!incomingToken) {
    return NextResponse.json({ error: 'Missing Gateway Token' }, { status: 401 });
  }

  // 3. User Authentication
  const { data: tokenData } = await getSupabaseAdminClient()
    .from('gateway_tokens')
    .select('user_id')
    .eq('token', incomingToken)
    .maybeSingle();

  if (!tokenData) {
    return NextResponse.json({ error: 'Invalid Gateway Token' }, { status: 401 });
  }
  const userId = tokenData.user_id;

  // 4. Resolve Target Path and Canonical Model Name
  const resolvedParams = await params;
  const urlPath = resolvedParams.path.join('/');

  let requestedModel = 'default';
  const modelMatch = urlPath.match(/models\/([^:]+)/);
  if (modelMatch) requestedModel = modelMatch[1];

  const modelLimits = getModelLimits(requestedModel);
  const modelName = modelLimits.id; 

  if (modelLimits.rpd === 0) {
    return NextResponse.json(
      { error: `Model ${modelName} is waitlisted or unavailable.` },
      { status: 403 }
    );
  }

  // 5. Fetch Key Pool & Live Telemetry
  const [keysReq, usageReq] = await Promise.all([
    getSupabaseAdminClient().from('api_keys').select('*').eq('user_id', userId),
    getSupabaseAdminClient()
      .from('model_usage')
      .select('*')
      .eq('user_id', userId)
      .eq('model_name', modelName),
  ]);

  const keys   = keysReq.data  || [];
  const usages = usageReq.data || [];

  if (keys.length === 0) {
    return NextResponse.json(
      { error: 'No API keys have been added to this Gateway account.' },
      { status: 400 }
    );
  }

  const now      = Date.now();
  const todayStr = getQuotaResetDateStr();

  const usageMap = new Map<string, { rpd: number; rpm: number; windowStart: number }>();
  usages.forEach(u => {
    const rpd = u.rpd_date === todayStr ? (u.rpd_count || 0) : 0;
    
    let rpm = 0;
    let windowStart = u.rpm_window_start || 0;
    
    // Only increment RPM if we are within 60s of the FIRST request in the window
    if (now - windowStart <= 60_000) {
      rpm = u.rpm_count || 0;
    } else {
      windowStart = now; // Window expired, reset window start
    }
    
    usageMap.set(u.api_key_id, { rpd, rpm, windowStart });
  });

  const hydratedKeys = keys.map(key => {
    let mutated = false;
    if (key.status === 'cooling' && now > (key.cooldown_until || 0)) {
      key.status = 'healthy';
      mutated    = true;
    }
    const modelStats = usageMap.get(key.id) || { rpd: 0, rpm: 0, windowStart: now };
    return { 
      ...key, 
      mutated, 
      model_rpd: modelStats.rpd, 
      model_rpm: modelStats.rpm,
      windowStart: modelStats.windowStart
    };
  });

  const availableKeys = hydratedKeys
    .filter(k => k.status === 'healthy' && k.model_rpm < modelLimits.rpm && k.model_rpd < modelLimits.rpd)
    .sort((a, b) =>
      a.model_rpd !== b.model_rpd ? a.model_rpd - b.model_rpd : a.model_rpm - b.model_rpm
    );

  if (availableKeys.length === 0) {
    return NextResponse.json(
      { error: `All API keys are exhausted or cooling for model: ${modelName}` },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 6. Process Request Payload
  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const payload = hasBody ? await req.arrayBuffer() : undefined;

  const outboundHeaders = new Headers();
  req.headers.forEach((val, key) => {
    const lower = key.toLowerCase();
    if (!['host', 'connection', 'x-goog-api-key', 'authorization', 'content-length', 'accept-encoding'].includes(lower)) {
      outboundHeaders.set(key, val);
    }
  });

  let lastResponse: NextResponse | null = null;

  // 7. Gateway Traversal loop
  for (const key of availableKeys) {
    try {
      const targetUrlObj = new URL(`https://generativelanguage.googleapis.com/${urlPath}`);
      reqUrl.searchParams.forEach((val, pKey) => {
        const lowerKey = pKey.toLowerCase();
        if (!['key', 'path', 'nxtp', 'nxtppath'].includes(lowerKey)) {
          targetUrlObj.searchParams.append(pKey, val);
        }
      });
      
      targetUrlObj.searchParams.append('key', key.key_value);

      const response = await fetch(targetUrlObj.toString(), {
        method:  req.method,
        headers: outboundHeaders,
        body:    payload,
      });

      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('content-encoding');
      responseHeaders.delete('content-length');

      const status = response.status;
      const isRateLimit = status === 429;
      const isDeadKey = status === 403;
      const isServerError = status >= 500;
      
      // We only want to retry on limits, dead keys, or temporary Google server faults.
      // Retrying on a 400 (Client Bad Request) will just multiply errors across all keys.
      const shouldRetry = isRateLimit || isDeadKey || isServerError;

      if (isRateLimit) {
        await Promise.all([
          updateKeyState(key.id, { errors: 1, requests: 1 }, {
            status:         'cooling',
            cooldown_until: now + 60_000,
            last_error:     `429 Rate Limited on model ${modelName}`,
          }),
          recordModelUsage(userId, key.id, modelName, todayStr, key.windowStart)
        ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));
        
        const errorBody = await response.text();
        lastResponse = new NextResponse(errorBody, { status: 429, headers: responseHeaders });
        continue;
      }

      if (isDeadKey) {
        await Promise.all([
          updateKeyState(key.id, { errors: 1, requests: 1 }, {
            status:       'dead',
            last_error:   'API Key Invalid (403)',
          }),
          recordModelUsage(userId, key.id, modelName, todayStr, key.windowStart)
        ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));
        
        const errorBody = await response.text();
        lastResponse = new NextResponse(errorBody, { status: 403, headers: responseHeaders });
        continue;
      }

      if (!response.ok) {
        await Promise.all([
          updateKeyState(key.id, { errors: 1, requests: 1 }, {
            last_error:   `API Error ${status}: ${response.statusText || 'Unknown'}`,
            ...(key.mutated ? { status: 'healthy' } : {}),
            last_used:    now,
          }),
          recordModelUsage(userId, key.id, modelName, todayStr, key.windowStart)
        ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));
        
        if (shouldRetry) {
          const errorBody = await response.text();
          lastResponse = new NextResponse(errorBody, { status: status, headers: responseHeaders });
          continue; 
        } else {
          // It's a client error (e.g. 400). Break the loop to stop burning RPD on other keys!
          return new NextResponse(response.body, { status: status, headers: responseHeaders });
        }
      }

      // Success!
      await Promise.all([
        updateKeyState(key.id, { requests: 1 }, {
          last_used:      now,
          ...(key.mutated ? { status: 'healthy' } : {}),
        }),
        recordModelUsage(userId, key.id, modelName, todayStr, key.windowStart),
      ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));

      return new NextResponse(response.body, { status: status, headers: responseHeaders });

    } catch (err: any) {
      await updateKeyState(key.id, { errors: 1 }, {
        last_error:   err?.message || 'Unknown network error',
      });
      lastResponse = NextResponse.json({ error: err?.message || 'Unknown network error' }, { status: 502 });
      continue;
    }
  }

  if (lastResponse) return lastResponse;

  return NextResponse.json({ error: 'All available keys failed to process the request.' }, { status: 502 });
}

export { handler as GET, handler as POST, handler as OPTIONS, handler as PUT, handler as PATCH, handler as DELETE };

async function updateKeyState(id: string, increments: { requests?: number, errors?: number }, updates: Record<string, unknown>) {
  const admin = getSupabaseAdminClient();
  
  // Fetch fresh stats just-in-time to prevent race conditions during concurrent requests
  const { data: current } = await admin.from('api_keys').select('total_requests, total_errors').eq('id', id).maybeSingle();
  
  const finalUpdates: Record<string, unknown> = { ...updates };
  if (increments.requests) finalUpdates.total_requests = (current?.total_requests || 0) + increments.requests;
  if (increments.errors)   finalUpdates.total_errors   = (current?.total_errors || 0) + increments.errors;

  const { error } = await admin.from('api_keys').update(finalUpdates).eq('id', id);
  if (error) console.error('[GemPrism] updateKeyState failed:', error.message);
}

async function recordModelUsage(userId: string, apiKeyId: string, modelName: string, todayStr: string, windowStart: number) {
  const admin = getSupabaseAdminClient();
  
  // Fetch fresh model usage just-in-time to prevent race condition tracking loss
  const { data: current } = await admin.from('model_usage')
    .select('*')
    .eq('api_key_id', apiKeyId)
    .eq('model_name', modelName)
    .maybeSingle();

  const now = Date.now();
  let rpd = 1;
  let rpm = 1;
  let updatedWindowStart = windowStart;

  if (current) {
    const isToday = current.rpd_date === todayStr;
    const isSameWindow = (now - (current.rpm_window_start || 0)) <= 60_000;

    rpd = isToday ? (current.rpd_count || 0) + 1 : 1;
    rpm = isSameWindow ? (current.rpm_count || 0) + 1 : 1;
    updatedWindowStart = isSameWindow ? current.rpm_window_start : now;
  } else {
    updatedWindowStart = now;
  }

  const { error } = await admin.from('model_usage').upsert(
    { 
      user_id: userId, 
      api_key_id: apiKeyId, 
      model_name: modelName, 
      rpd_count: rpd, 
      rpm_count: rpm, 
      rpd_date: todayStr, 
      rpm_window_start: updatedWindowStart 
    },
    { onConflict: 'api_key_id,model_name' }
  );
  if (error) console.error('[GemPrism] recordModelUsage failed:', error.message, error.details);
}