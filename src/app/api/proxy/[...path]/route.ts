import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { getModelLimits } from '@/lib/modelLimits';

export const runtime = 'edge';

// Handle all HTTP methods seamlessly through a single master handler
export async function handler(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  // 1. CORS Preflight & Global Headers
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }

  const reqUrl = new URL(req.url);

  // 2. Token Extraction (Header, Bearer, or Query Param to support all SDKs)
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
    .single();

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
  const usages = usageReq.data ||[];

  if (keys.length === 0) {
    return NextResponse.json(
      { error: 'No API keys have been added to this Gateway account.' },
      { status: 400 }
    );
  }

  const now      = Date.now();
  const todayStr = new Date().toISOString().split('T')[0];

  const usageMap = new Map<string, { rpd: number; rpm: number }>();
  usages.forEach(u => {
    const rpd = u.rpd_date === todayStr ? (u.rpd_count || 0) : 0;
    const rpm = now - (u.rpm_window_start || 0) <= 60_000 ? (u.rpm_count || 0) : 0;
    usageMap.set(u.api_key_id, { rpd, rpm });
  });

  const hydratedKeys = keys.map(key => {
    let mutated = false;
    if (key.status === 'cooling' && now > (key.cooldown_until || 0)) {
      key.status = 'healthy';
      mutated    = true;
    }
    const modelStats = usageMap.get(key.id) || { rpd: 0, rpm: 0 };
    return { ...key, mutated, model_rpd: modelStats.rpd, model_rpm: modelStats.rpm };
  });

  const availableKeys = hydratedKeys
    .filter(k => k.status === 'healthy' && k.model_rpm < modelLimits.rpm && k.model_rpd < modelLimits.rpd)
    .sort((a, b) =>
      a.model_rpd !== b.model_rpd ? a.model_rpd - b.model_rpd : a.model_rpm - b.model_rpm
    );

  if (availableKeys.length === 0) {
    return NextResponse.json(
      { error: `All API keys are exhausted or cooling for model: ${modelName}` },
      { status: 429 } // Return 429 so SDKs trigger standard back-off handling
    );
  }

  // 6. Process Request Payload
  // Using arrayBuffer protects binary uploads (like images via File API) from text corruption
  // while still buffering it in memory so we can retry multiple keys.
  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const payload = hasBody ? await req.arrayBuffer() : undefined;

  // Forward Headers verbatim (exclude auth and routing specifics)
  const outboundHeaders = new Headers();
  req.headers.forEach((val, key) => {
    const lower = key.toLowerCase();
    if (!['host', 'connection', 'x-goog-api-key', 'authorization', 'content-length'].includes(lower)) {
      outboundHeaders.set(key, val);
    }
  });

  // 7. Gateway Traversal loop (Failover execution)
  for (const key of availableKeys) {
    try {
      // Construct exact target URL including ALL original SDK query parameters
      const targetUrlObj = new URL(`https://generativelanguage.googleapis.com/${urlPath}`);
      reqUrl.searchParams.forEach((val, pKey) => {
        const lowerKey = pKey.toLowerCase();
        if (!['key', 'path', 'nxtp', 'nxtppath'].includes(lowerKey)) {
          targetUrlObj.searchParams.append(pKey, val);
        }
      });
      
      // Inject the active Google API key selected by the load balancer
      targetUrlObj.searchParams.append('key', key.key_value);

      const response = await fetch(targetUrlObj.toString(), {
        method:  req.method,
        headers: outboundHeaders,
        body:    payload,
      });

      // Handle 429 Rate Limit
      if (response.status === 429) {
        await updateKeyState(key.id, {
          status:         'cooling',
          cooldown_until: now + 90_000,
          total_errors:   (key.total_errors || 0) + 1,
          last_error:     `429 Rate Limited on model ${modelName}`,
        });
        continue; // Roll over to the next key
      }

      // Handle 403 Invalid/Revoked Key
      if (response.status === 403) {
        await updateKeyState(key.id, {
          status:       'dead',
          total_errors: (key.total_errors || 0) + 1,
          last_error:   'API Key Invalid (403)',
        });
        continue; // Roll over to the next key
      }

      // Route Success - Pipe Response directly to client
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*'); 

      // Fire-and-forget telemetry update
      if (response.ok) {
        Promise.all([
          updateKeyState(key.id, {
            total_requests: (key.total_requests || 0) + 1,
            last_used:      now,
            ...(key.mutated ? { status: 'healthy' } : {}),
          }),
          recordModelUsage(
            userId,
            key.id,
            modelName,
            key.model_rpd + 1,
            key.model_rpm + 1,
            todayStr,
            now
          ),
        ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));
      }

      return new NextResponse(response.body, {
        status: response.status,
        headers: responseHeaders,
      });

    } catch (err: any) {
      await updateKeyState(key.id, {
        total_errors: (key.total_errors || 0) + 1,
        last_error:   err?.message || 'Unknown network error',
      });
    }
  }

  return NextResponse.json(
    { error: 'All available keys failed to process the request.' },
    { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
  );
}

// Map the master handler to all HTTP methods used by the GenAI SDK
export { handler as GET, handler as POST, handler as OPTIONS, handler as PUT, handler as PATCH, handler as DELETE };

// ─── Database Helpers ─────────────────────────────────────────────────────────

async function updateKeyState(id: string, updates: Record<string, unknown>) {
  const { error } = await getSupabaseAdminClient().from('api_keys').update(updates).eq('id', id);
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
  const { error } = await getSupabaseAdminClient().from('model_usage').upsert(
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