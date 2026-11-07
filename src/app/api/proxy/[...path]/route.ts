import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { fetchAvailableModels, getFallbackChain, getQuotaResetDateStr } from '@/lib/modelLimits';

export const runtime = 'nodejs';
export const maxDuration = 300; 

export async function handler(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200 });
  }

  const reqUrl = new URL(req.url);

  let incomingToken = req.headers.get('x-goog-api-key') || reqUrl.searchParams.get('key');
  if (!incomingToken) {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) incomingToken = auth.split(' ')[1];
  }

  if (!incomingToken) {
    return NextResponse.json({ error: 'Missing Gateway Token' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: tokenData } = await admin
    .from('gateway_tokens')
    .select('user_id')
    .eq('token', incomingToken)
    .maybeSingle();

  if (!tokenData) {
    return NextResponse.json({ error: 'Invalid Gateway Token' }, { status: 401 });
  }
  const userId = tokenData.user_id;

  const resolvedParams = await params;
  const urlPath = resolvedParams.path.join('/');

  let requestedModel = 'default';
  const modelMatch = urlPath.match(/models\/([^:]+)/);
  if (modelMatch) requestedModel = modelMatch[1];

  const { data: keysData } = await admin
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true }); // Always sort deterministically

  const keys = keysData || [];
  if (keys.length === 0) {
    return NextResponse.json(
      { error: 'No API keys have been added to this Gateway account.' },
      { status: 400 }
    );
  }

  // Active keys only (Ignore 403 permanently dead keys, but allow exhausted 429 keys sequentially)
  const activeKeys = keys.filter(k => k.status !== 'dead');
  if (activeKeys.length === 0) {
    return NextResponse.json(
      { error: 'All API keys are marked as dead (403).' },
      { status: 400 }
    );
  }

  // Dynamically fetch models from the first active key and resolve logic
  const availableModels = await fetchAvailableModels(activeKeys[0].key_value);
  const currentChain = getFallbackChain(requestedModel, availableModels);

  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const originalPayload = hasBody ? await req.arrayBuffer() : undefined;

  const todayStr = getQuotaResetDateStr();
  const now = Date.now();

  let lastResponse: NextResponse | null = null;

  // KEY LOOP: Try keys sequentially
  keyLoop: for (const key of activeKeys) {
    // MODEL LOOP: Sequence through models when facing 500s or 503 Overloaded
    modelLoop: for (const model of currentChain) {
      try {
        const currentUrlPath = urlPath.replace(new RegExp(`(models/)${requestedModel}`), `$1${model}`);
        const targetUrlObj = new URL(`https://generativelanguage.googleapis.com/${currentUrlPath}`);
        
        reqUrl.searchParams.forEach((val, pKey) => {
          const lowerKey = pKey.toLowerCase();
          if (!['key', 'path', 'nxtp', 'nxtppath'].includes(lowerKey)) {
            targetUrlObj.searchParams.append(pKey, val);
          }
        });
        targetUrlObj.searchParams.append('key', key.key_value);

        let currentPayload = originalPayload;
        if (originalPayload && originalPayload.byteLength > 0 && model !== requestedModel) {
          try {
            const bodyString = new TextDecoder().decode(originalPayload);
            const modifiedString = bodyString.replace(
              new RegExp(`("model"\\s*:\\s*"[^"]*)${requestedModel}(")`, 'g'),
              `$1${model}$2`
            );
            currentPayload = new TextEncoder().encode(modifiedString).buffer;
          } catch(e) {
            console.error("[GemPrism] Failed to replace model in body", e);
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

        // Asynchronous telemetry update (we still track usage for the dashboard display)
        Promise.all([
          updateKeyState(key.id, { requests: 1, errors: status >= 400 && status !== 429 ? 1 : 0 }, { 
            last_used: now,
            ...(status >= 400 ? { last_error: `API Error ${status} on model ${model}` } : {})
          }),
          recordModelUsage(userId, key.id, model, todayStr)
        ]).catch(err => console.error("[GemPrism] Telemetry error:", err));

        if (status === 200) {
          const successHeaders = new Headers(responseHeaders);
          if (model !== requestedModel) {
             successHeaders.set('X-Gemprism-Fallback', `Requested ${requestedModel} but used ${model}`);
          }
          return new NextResponse(response.body, { status, headers: successHeaders });
        }

        if (status === 429) {
          // Limit exceeded for this key. Skip to next API key immediately (zero cooldown logic)
          lastResponse = new NextResponse(await response.text(), { status: 429, headers: responseHeaders });
          continue keyLoop;
        }

        if (status === 403) {
          // Invalid key (dead). Mark it definitively and move to next key.
          await updateKeyState(key.id, {}, { status: 'dead', last_error: 'API Key Invalid (403)' });
          lastResponse = new NextResponse(await response.text(), { status: 403, headers: responseHeaders });
          continue keyLoop;
        }

        if (status === 503 || status >= 500) {
          // Model Overloaded / Server Error. Stay on the SAME API key, but step down the model chain.
          const errorBody = await response.text();
          const fallbackHeaders = new Headers(responseHeaders);
          fallbackHeaders.set('X-Gemprism-Fallback', `Failed on ${model} due to ${status}`);
          lastResponse = new NextResponse(errorBody, { status, headers: fallbackHeaders });
          continue modelLoop;
        }

        // For any other client error (e.g. 400 Bad Request), don't retry and fail out cleanly.
        return new NextResponse(response.body, { status, headers: responseHeaders });

      } catch (err: any) {
        await updateKeyState(key.id, { errors: 1 }, { last_error: err?.message || 'Network error' });
        lastResponse = NextResponse.json({ error: err?.message || 'Network error' }, { status: 502 });
        continue keyLoop; // If the network request fails completely for this key, move to next key
      }
    }
  }

  return lastResponse || NextResponse.json({ error: 'All available keys failed to process the request.' }, { status: 502 });
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

async function recordModelUsage(userId: string, apiKeyId: string, modelName: string, todayStr: string) {
  const admin = getSupabaseAdminClient();
  
  const { data: current } = await admin.from('model_usage')
    .select('*')
    .eq('api_key_id', apiKeyId)
    .eq('model_name', modelName)
    .maybeSingle();

  const now = Date.now();
  let rpd = 1;
  let rpm = 1;
  let updatedWindowStart = now;

  if (current) {
    const isToday = current.rpd_date === todayStr;
    const isSameWindow = (now - (current.rpm_window_start || 0)) <= 60_000;

    rpd = isToday ? (current.rpd_count || 0) + 1 : 1;
    rpm = isSameWindow ? (current.rpm_count || 0) + 1 : 1;
    updatedWindowStart = isSameWindow ? current.rpm_window_start : now;
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
  if (error) console.error('[GemPrism] recordModelUsage failed:', error.message);
}