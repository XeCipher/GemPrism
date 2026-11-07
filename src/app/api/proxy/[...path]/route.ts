import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { getModelLimits, getQuotaResetDateStr, MODEL_FALLBACKS } from '@/lib/modelLimits';

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
  const originalModelName = modelLimits.id; 

  if (modelLimits.rpd === 0) {
    return NextResponse.json(
      { error: `Model ${originalModelName} is waitlisted or unavailable.` },
      { status: 403 }
    );
  }

  // Resolve Fallback list (Up to 2 previous models as requested)
  const fallbackList = MODEL_FALLBACKS[originalModelName] || [];
  const modelsToTry = [originalModelName, ...fallbackList.slice(0, 2)];
  const uniqueModels = Array.from(new Set(modelsToTry));

  // 5. Fetch Key Pool & Live Telemetry for ALL unique fallback models simultaneously
  const [keysReq, usageReq] = await Promise.all([
    getSupabaseAdminClient().from('api_keys').select('*').eq('user_id', userId),
    getSupabaseAdminClient()
      .from('model_usage')
      .select('*')
      .eq('user_id', userId)
      .in('model_name', uniqueModels),
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

  // Create a composite map (key_id + model_name) to support cross-model routing
  const usageMap = new Map<string, { rpd: number; rpm: number; windowStart: number }>();
  usages.forEach(u => {
    const rpd = u.rpd_date === todayStr ? (u.rpd_count || 0) : 0;
    
    let rpm = 0;
    let windowStart = u.rpm_window_start || 0;
    
    if (now - windowStart <= 60_000) {
      rpm = u.rpm_count || 0;
    } else {
      windowStart = now; // Window expired, reset window start
    }
    
    usageMap.set(`${u.api_key_id}_${u.model_name}`, { rpd, rpm, windowStart });
  });

  // Extract Payload upfront because it will be needed multiple times in the degradation loop
  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const originalPayload = hasBody ? await req.arrayBuffer() : undefined;

  let lastResponse: NextResponse | null = null;

  // 6. 503 Overloaded Model Degradation Loop
  for (let m = 0; m < uniqueModels.length; m++) {
    const currentModelName = uniqueModels[m];
    const currentLimits = getModelLimits(currentModelName);
    
    if (currentLimits.rpd === 0) continue;

    // Hydrate key list specifically for the current model in the loop
    const hydratedKeys = keys.map(key => {
      let mutated = false;
      if (key.status === 'cooling' && now > (key.cooldown_until || 0)) {
        key.status = 'healthy';
        mutated    = true;
      }
      const modelStats = usageMap.get(`${key.id}_${currentModelName}`) || { rpd: 0, rpm: 0, windowStart: now };
      return { 
        ...key, 
        mutated, 
        model_rpd: modelStats.rpd, 
        model_rpm: modelStats.rpm,
        windowStart: modelStats.windowStart
      };
    });

    const availableKeys = hydratedKeys
      .filter(k => k.status === 'healthy' && k.model_rpm < currentLimits.rpm && k.model_rpd < currentLimits.rpd)
      .sort((a, b) =>
        a.model_rpd !== b.model_rpd ? a.model_rpd - b.model_rpd : a.model_rpm - b.model_rpm
      );

    if (availableKeys.length === 0) {
      lastResponse = NextResponse.json(
        { error: `All API keys are exhausted or cooling for model: ${currentModelName}` },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
      // Exhaustion is normal; don't downgrade models on 429, only break and return to client
      break; 
    }

    let shouldFallbackModel = false;

    // 7. Gateway Traversal loop (API Keys)
    for (const key of availableKeys) {
      try {
        // Substitute Original Model name with the new Fallback Model in URL path safely
        const currentUrlPath = urlPath.replace(new RegExp(`(models/)${requestedModel}`), `$1${currentModelName}`);
        const targetUrlObj = new URL(`https://generativelanguage.googleapis.com/${currentUrlPath}`);
        
        reqUrl.searchParams.forEach((val, pKey) => {
          const lowerKey = pKey.toLowerCase();
          if (!['key', 'path', 'nxtp', 'nxtppath'].includes(lowerKey)) {
            targetUrlObj.searchParams.append(pKey, val);
          }
        });
        
        targetUrlObj.searchParams.append('key', key.key_value);

        // Substitute Original Model name inside JSON Body dynamically if it is a POST
        let currentPayload = originalPayload;
        if (originalPayload && originalPayload.byteLength > 0 && currentModelName !== requestedModel) {
          try {
            const bodyString = new TextDecoder().decode(originalPayload);
            // Replace pattern like "model": "models/gemini-flash-latest" gracefully
            const modifiedString = bodyString.replace(
              new RegExp(`("model"\\s*:\\s*"[^"]*)${requestedModel}(")`, 'g'),
              `$1${currentModelName}$2`
            );
            currentPayload = new TextEncoder().encode(modifiedString).buffer;
          } catch(e) {
            console.error("[GemPrism] Failed to parse and replace model in body", e);
          }
        }

        const outboundHeaders = new Headers();
        req.headers.forEach((val, hKey) => {
          const lower = hKey.toLowerCase();
          if (!['host', 'connection', 'x-goog-api-key', 'authorization', 'content-length', 'accept-encoding'].includes(lower)) {
            outboundHeaders.set(hKey, val);
          }
        });

        const response = await fetch(targetUrlObj.toString(), {
          method:  req.method,
          headers: outboundHeaders,
          body:    currentPayload,
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete('content-encoding');
        responseHeaders.delete('content-length');

        const status = response.status;
        const isRateLimit = status === 429;
        const isDeadKey = status === 403;
        const isOverloaded = status === 503;
        const isServerError = status >= 500 && !isOverloaded; // Basic 500s (temporary faults)
        
        const shouldRetryKey = isRateLimit || isDeadKey || isServerError;

        // Model Degradation Switch
        if (isOverloaded) {
          await Promise.all([
            updateKeyState(key.id, { errors: 1, requests: 1 }, {
              last_error: `503 Overloaded on model ${currentModelName}`,
              ...(key.mutated ? { status: 'healthy' } : {}),
              last_used: now,
            }),
            recordModelUsage(userId, key.id, currentModelName, todayStr, key.windowStart)
          ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));
          
          const errorBody = await response.text();
          const fallbackHeaders = new Headers(responseHeaders);
          fallbackHeaders.set('X-Gemprism-Fallback', `Failed on ${currentModelName} due to 503`);
          lastResponse = new NextResponse(errorBody, { status: 503, headers: fallbackHeaders });
          
          shouldFallbackModel = true;
          break; // Model overloaded, break out of key loop, jump to older model!
        }

        if (isRateLimit) {
          await Promise.all([
            updateKeyState(key.id, { errors: 1, requests: 1 }, {
              status:         'cooling',
              cooldown_until: now + 60_000,
              last_error:     `429 Rate Limited on model ${currentModelName}`,
            }),
            recordModelUsage(userId, key.id, currentModelName, todayStr, key.windowStart)
          ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));
          
          const errorBody = await response.text();
          lastResponse = new NextResponse(errorBody, { status: 429, headers: responseHeaders });
          continue; // Try next key
        }

        if (isDeadKey) {
          await Promise.all([
            updateKeyState(key.id, { errors: 1, requests: 1 }, {
              status:       'dead',
              last_error:   'API Key Invalid (403)',
            }),
            recordModelUsage(userId, key.id, currentModelName, todayStr, key.windowStart)
          ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));
          
          const errorBody = await response.text();
          lastResponse = new NextResponse(errorBody, { status: 403, headers: responseHeaders });
          continue; // Try next key
        }

        if (!response.ok) {
          await Promise.all([
            updateKeyState(key.id, { errors: 1, requests: 1 }, {
              last_error:   `API Error ${status}: ${response.statusText || 'Unknown'}`,
              ...(key.mutated ? { status: 'healthy' } : {}),
              last_used:    now,
            }),
            recordModelUsage(userId, key.id, currentModelName, todayStr, key.windowStart)
          ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));
          
          if (shouldRetryKey) {
            const errorBody = await response.text();
            lastResponse = new NextResponse(errorBody, { status: status, headers: responseHeaders });
            continue; 
          } else {
            // Client error (e.g. 400). Break the loop to stop burning RPD on other keys!
            return new NextResponse(response.body, { status: status, headers: responseHeaders });
          }
        }

        // Success!
        await Promise.all([
          updateKeyState(key.id, { requests: 1 }, {
            last_used:      now,
            ...(key.mutated ? { status: 'healthy' } : {}),
          }),
          recordModelUsage(userId, key.id, currentModelName, todayStr, key.windowStart),
        ]).catch(err => console.error("[GemPrism] Async telemetry error:", err));

        const successHeaders = new Headers(responseHeaders);
        if (currentModelName !== originalModelName) {
           successHeaders.set('X-Gemprism-Fallback', `Requested ${requestedModel} but used ${currentModelName} due to 503 Overloaded`);
        }

        return new NextResponse(response.body, { status: status, headers: successHeaders });

      } catch (err: any) {
        await updateKeyState(key.id, { errors: 1 }, {
          last_error:   err?.message || 'Unknown network error',
        });
        lastResponse = NextResponse.json({ error: err?.message || 'Unknown network error' }, { status: 502 });
        continue;
      }
    } // Key loop end

    if (!shouldFallbackModel) {
      // Did not hit a 503 Overloaded state. No need to try older models.
      break; 
    }
  } // Model loop end

  if (lastResponse) return lastResponse;

  return NextResponse.json({ error: 'All available keys failed to process the request.' }, { status: 502 });
}

export { handler as GET, handler as POST, handler as OPTIONS, handler as PUT, handler as PATCH, handler as DELETE };

async function updateKeyState(id: string, increments: { requests?: number, errors?: number }, updates: Record<string, unknown>) {
  const admin = getSupabaseAdminClient();
  const { data: current } = await admin.from('api_keys').select('total_requests, total_errors').eq('id', id).maybeSingle();
  
  const finalUpdates: Record<string, unknown> = { ...updates };
  if (increments.requests) finalUpdates.total_requests = (current?.total_requests || 0) + increments.requests;
  if (increments.errors)   finalUpdates.total_errors   = (current?.total_errors || 0) + increments.errors;

  const { error } = await admin.from('api_keys').update(finalUpdates).eq('id', id);
  if (error) console.error('[GemPrism] updateKeyState failed:', error.message);
}

async function recordModelUsage(userId: string, apiKeyId: string, modelName: string, todayStr: string, windowStart: number) {
  const admin = getSupabaseAdminClient();
  
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