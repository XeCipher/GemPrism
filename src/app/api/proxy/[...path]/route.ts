import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { fetchAvailableModels, getFallbackChain, getQuotaResetDateStr } from '@/lib/modelLimits';

export const runtime = 'edge';

interface CacheEntry {
  userId: string;
  keys: any[];
  expires: number;
}

// In-memory cache shared across requests in the same Edge isolate
const poolCache = new Map<string, CacheEntry>();

type RouteContext = { params: Promise<{ path: string[] }> };

async function handler(req: Request, context: RouteContext) {
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

  const now = Date.now();
  let userId: string;
  let keys: any[] = [];

  // Cleanup to prevent unbounded growth in long-running edge isolates
  if (poolCache.size > 1000) {
    for (const [k, v] of poolCache.entries()) {
      if (v.expires < now) poolCache.delete(k);
    }
  }

  const cached = poolCache.get(incomingToken);
  if (cached && cached.expires > now) {
    userId = cached.userId;
    keys = cached.keys;
  } else {
    const admin = getSupabaseAdminClient();
    const { data: tokenData } = await admin
      .from('gateway_tokens')
      .select('user_id')
      .eq('token', incomingToken)
      .maybeSingle();

    if (!tokenData) {
      return NextResponse.json({ error: 'Invalid Gateway Token' }, { status: 401 });
    }
    userId = tokenData.user_id;

    const { data: keysData } = await admin
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true }); // Always sort deterministically

    keys = keysData || [];
    // Cache for 60 seconds to significantly reduce DB latency on sequential API calls
    poolCache.set(incomingToken, { userId, keys, expires: now + 60000 });
  }

  const resolvedParams = await context.params;
  const urlPath = resolvedParams.path.join('/');

  let requestedModel = 'default';
  const modelMatch = urlPath.match(/models\/([^:]+)/);
  if (modelMatch) requestedModel = modelMatch[1];

  // OPTIMIZATION: 15-second micro-cooldown applied to exhausted keys.
  const activeKeys = keys.filter(k => k.status !== 'dead' && (k.cooldown_until || 0) < now);
  
  if (activeKeys.length === 0) {
    return NextResponse.json(
      { error: 'All API keys are exhausted (429) or dead. Please wait a few seconds.' },
      { status: 429, headers: { 'Retry-After': '15' } }
    );
  }

  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const originalPayload = hasBody ? await req.arrayBuffer() : undefined;
  const todayStr = getQuotaResetDateStr();

  let lastResponse: NextResponse | null = null;

  // LAZY FETCH OPTIMIZATION: 
  let chain = [requestedModel]; 
  let hasFetchedModels = false;

  keyLoop: for (const key of activeKeys) {
    let mIndex = 0;
    
    modelLoop: while (mIndex < chain.length) {
      const model = chain[mIndex];

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
        const callTime = Date.now();

        // Immediate Local State Update for subsequent requests hitting this Edge isolate
        if (status === 429) {
          key.cooldown_until = callTime + 15000;
        } else if (status === 403) {
          key.status = 'dead';
        }

        // Native Next.js 15+ background task
        after(async () => {
          try {
            await Promise.all([
              updateKeyState(key, { requests: 1, errors: status >= 400 && status !== 429 ? 1 : 0 }, { 
                last_used: callTime,
                ...(status === 429 ? { cooldown_until: callTime + 15000 } : {}), 
                ...(status === 403 ? { status: 'dead', last_error: 'API Key Invalid (403)' } : {}),
                ...(status >= 500 ? { last_error: `API Error ${status} on model ${model}` } : {})
              }),
              recordModelUsage(userId, key.id, model, todayStr)
            ]);
          } catch (err) {
            console.error("[GemPrism] Telemetry error:", err);
          }
        });

        if (status === 200) {
          const successHeaders = new Headers(responseHeaders);
          if (model !== requestedModel) {
             successHeaders.set('X-Gemprism-Fallback', `Requested ${requestedModel} but used ${model}`);
          }
          return new NextResponse(response.body, { status, headers: successHeaders });
        }

        if (status === 429) {
          lastResponse = new NextResponse(await response.text(), { status: 429, headers: responseHeaders });
          continue keyLoop;
        }

        if (status === 403) {
          lastResponse = new NextResponse(await response.text(), { status: 403, headers: responseHeaders });
          continue keyLoop;
        }

        if (status === 503 || status >= 500) {
          if (!hasFetchedModels) {
            const availableModels = await fetchAvailableModels(key.key_value);
            chain = getFallbackChain(requestedModel, availableModels);
            hasFetchedModels = true;
          }

          const errorBody = await response.text();
          const fallbackHeaders = new Headers(responseHeaders);
          fallbackHeaders.set('X-Gemprism-Fallback', `Failed on ${model} due to ${status}`);
          lastResponse = new NextResponse(errorBody, { status, headers: fallbackHeaders });
          
          mIndex++;
          continue modelLoop; 
        }

        return new NextResponse(response.body, { status, headers: responseHeaders });

      } catch (err: any) {
        key.total_errors = (key.total_errors || 0) + 1;
        key.last_error = err?.message || 'Network error';

        after(async () => {
          try {
            await updateKeyState(key, { errors: 1 }, { last_error: err?.message || 'Network error' });
          } catch (e) {}
        });
        
        lastResponse = NextResponse.json({ error: err?.message || 'Network error' }, { status: 502 });
        continue keyLoop; 
      }
    }
  }

  return lastResponse || NextResponse.json({ error: 'All available keys failed to process the request.' }, { status: 502 });
}

// Next.js compiler requires explicit function exports for App Router API routes to recognize them correctly.
export async function GET(req: Request, context: RouteContext) { return handler(req, context); }
export async function POST(req: Request, context: RouteContext) { return handler(req, context); }
export async function OPTIONS(req: Request, context: RouteContext) { return handler(req, context); }
export async function PUT(req: Request, context: RouteContext) { return handler(req, context); }
export async function PATCH(req: Request, context: RouteContext) { return handler(req, context); }
export async function DELETE(req: Request, context: RouteContext) { return handler(req, context); }

async function updateKeyState(key: any, increments: { requests?: number, errors?: number }, updates: Record<string, unknown>) {
  const admin = getSupabaseAdminClient();
  
  const finalUpdates: Record<string, unknown> = { ...updates };
  if (increments.requests) {
    key.total_requests = (key.total_requests || 0) + increments.requests;
    finalUpdates.total_requests = key.total_requests;
  }
  if (increments.errors) {
    key.total_errors = (key.total_errors || 0) + increments.errors;
    finalUpdates.total_errors = key.total_errors;
  }

  const { error } = await admin.from('api_keys').update(finalUpdates).eq('id', key.id);
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