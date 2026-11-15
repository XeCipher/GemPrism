import { after, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  buildModelFallbackChain,
  classifyErrorResponse,
  discoverModelsForKeys,
  getQuotaResetDateStr,
  resolveModelAlias,
} from "@/lib/geminiModels";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string | null;
  key_value: string;
  status: string;
  cooldown_until: number | null;
  total_requests: number | null;
  total_errors: number | null;
  last_error: string | null;
  last_used: number | null;
}

interface ModelUsageRow {
  id: string;
  user_id: string;
  api_key_id: string;
  model_name: string;
  rpd_count: number | null;
  rpm_count: number | null;
  rpd_date: string | null;
  rpm_window_start: number | null;
}

interface HotCooldownEntry {
  until: number;
  isDaily: boolean;
  todayStr: string;
  statusCode: number;
}

interface HotBurstEntry {
  count: number;
  windowStart: number;
}

interface PendingKeyDelta {
  requests: number;
  errors: number;
  updates: Record<string, unknown>;
}

const COOLDOWN_PREFIX = "__cooldown:";
const BASE_ATTEMPT_TIMEOUT_MS = 20_000;
const FALLBACK_ATTEMPT_TIMEOUT_MS = 14_000;
const OVERLOAD_CACHE_MS = 10_000;

// Process-local hot state shared across concurrent requests in the same Node instance
const hotCacheGlobal = globalThis as typeof globalThis & {
  __gemprismHotCooldowns?: Map<string, HotCooldownEntry>;
  __gemprismHotDeadKeys?: Map<string, number>;
  __gemprismHotOverloadedModels?: Map<string, number>;
  __gemprismHotInFlight?: Map<string, number>;
  __gemprismHotBurstRpm?: Map<string, HotBurstEntry>;
};

function getHotCooldowns() {
  if (!hotCacheGlobal.__gemprismHotCooldowns) {
    hotCacheGlobal.__gemprismHotCooldowns = new Map();
  }
  return hotCacheGlobal.__gemprismHotCooldowns;
}

function getHotDeadKeys() {
  if (!hotCacheGlobal.__gemprismHotDeadKeys) {
    hotCacheGlobal.__gemprismHotDeadKeys = new Map();
  }
  return hotCacheGlobal.__gemprismHotDeadKeys;
}

function getHotOverloadedModels() {
  if (!hotCacheGlobal.__gemprismHotOverloadedModels) {
    hotCacheGlobal.__gemprismHotOverloadedModels = new Map();
  }
  return hotCacheGlobal.__gemprismHotOverloadedModels;
}

function getHotInFlight() {
  if (!hotCacheGlobal.__gemprismHotInFlight) {
    hotCacheGlobal.__gemprismHotInFlight = new Map();
  }
  return hotCacheGlobal.__gemprismHotInFlight;
}

function getHotBurstRpm() {
  if (!hotCacheGlobal.__gemprismHotBurstRpm) {
    hotCacheGlobal.__gemprismHotBurstRpm = new Map();
  }
  return hotCacheGlobal.__gemprismHotBurstRpm;
}

function getBurstCount(map: Map<string, HotBurstEntry>, pairKey: string, now: number): number {
  const entry = map.get(pairKey);
  if (!entry) return 0;
  if (now - entry.windowStart > 60_000) {
    map.delete(pairKey);
    return 0;
  }
  return entry.count;
}

function bumpBurstCount(map: Map<string, HotBurstEntry>, pairKey: string, now: number) {
  const entry = map.get(pairKey);
  if (!entry || now - entry.windowStart > 60_000) {
    map.set(pairKey, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractModelFromRequest(
  urlPath: string,
  payloadBuffer?: ArrayBuffer
): { requestedModel: string | null; action: string | null } {
  const pathMatch = urlPath.match(/models\/([^/:]+)(?::([^/?]+))?/);
  if (pathMatch) {
    return {
      requestedModel: pathMatch[1],
      action: pathMatch[2] || "generateContent",
    };
  }

  if (payloadBuffer && payloadBuffer.byteLength > 0) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(payloadBuffer)) as { model?: string };
      if (typeof parsed.model === "string" && parsed.model.trim()) {
        return {
          requestedModel: parsed.model.replace(/^models\//i, "").trim(),
          action: "generateContent",
        };
      }
    } catch {
      // Non-JSON payload
    }
  }

  return { requestedModel: null, action: null };
}

function substituteModelInUrlPath(
  urlPath: string,
  fromModel: string,
  toModel: string
): string {
  if (!fromModel || fromModel === toModel) return urlPath;
  const escaped = escapeRegex(fromModel);
  return urlPath.replace(new RegExp(`(models/)${escaped}(?=[/:?]|$)`, "i"), `$1${toModel}`);
}

function substituteModelInPayload(
  payload: ArrayBuffer | undefined,
  fromModel: string,
  toModel: string
): ArrayBuffer | undefined {
  if (!payload || payload.byteLength === 0 || !fromModel || fromModel === toModel) {
    return payload;
  }

  try {
    const raw = new TextDecoder().decode(payload);
    const escaped = escapeRegex(fromModel);
    const updated = raw.replace(
      new RegExp(`("model"\\s*:\\s*"(?:models/)?)${escaped}(")`, "gi"),
      `$1${toModel}$2`
    );
    return new TextEncoder().encode(updated).buffer;
  } catch {
    return payload;
  }
}

export async function handler(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 200 });
  }

  const reqUrl = new URL(req.url);

  // 1. Extract Gateway Token
  let incomingToken = req.headers.get("x-goog-api-key") || reqUrl.searchParams.get("key");
  if (!incomingToken) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      incomingToken = auth.split(" ")[1];
    }
  }

  if (!incomingToken) {
    return NextResponse.json({ error: "Missing Gateway Token" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();

  // 2. Authenticate Token -> User
  const { data: tokenData } = await admin
    .from("gateway_tokens")
    .select("user_id")
    .eq("token", incomingToken)
    .maybeSingle();

  if (!tokenData) {
    return NextResponse.json({ error: "Invalid Gateway Token" }, { status: 401 });
  }
  const userId = tokenData.user_id as string;

  // 3. Parse URL & Payload
  const resolvedParams = await params;
  const urlPath = resolvedParams.path.join("/");
  const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const originalPayload = hasBody ? await req.arrayBuffer() : undefined;

  const { requestedModel, action } = extractModelFromRequest(urlPath, originalPayload);

  // 4. Fetch Key Pool & Live Telemetry
  const [keysReq, usageReq] = await Promise.all([
    admin.from("api_keys").select("*").eq("user_id", userId),
    admin.from("model_usage").select("*").eq("user_id", userId),
  ]);

  const keys = (keysReq.data || []) as ApiKeyRow[];
  const usageRows = (usageReq.data || []) as ModelUsageRow[];

  if (keys.length === 0) {
    return NextResponse.json(
      { error: "No API keys have been added to this Gateway account." },
      { status: 400 }
    );
  }

  // 5. Discover live models dynamically
  const historicalModelIds = usageRows.map((u) => u.model_name);
  let discovery = await discoverModelsForKeys(keys, {
    userId,
    historicalModelIds,
  });

  if (
    requestedModel &&
    !discovery.models.some((m) => m.id === requestedModel.toLowerCase()) &&
    Date.now() - discovery.meta.syncedAt > 30_000
  ) {
    discovery = await discoverModelsForKeys(keys, {
      userId,
      forceRefresh: true,
      historicalModelIds,
    });
  }

  const now = Date.now();
  const todayStr = getQuotaResetDateStr();
  const hotCooldowns = getHotCooldowns();
  const hotDeadKeys = getHotDeadKeys();
  const hotOverloaded = getHotOverloadedModels();
  const hotInFlight = getHotInFlight();
  const hotBurstRpm = getHotBurstRpm();

  // Index usage counts & DB cooldowns
  const usageMap = new Map<string, { rpd: number; rpm: number; windowStart: number }>();
  const modelCooldownMap = new Map<string, { until: number; isDaily: boolean }>();

  for (const row of usageRows) {
    if (row.model_name.startsWith(COOLDOWN_PREFIX)) {
      const targetModel = row.model_name.slice(COOLDOWN_PREFIX.length);
      const until = row.rpm_window_start || 0;
      const isDaily = (row.rpd_count || 0) > 0;
      const isValidToday = !isDaily || row.rpd_date === todayStr;

      if (until > now && isValidToday) {
        modelCooldownMap.set(`${row.api_key_id}_${targetModel}`, { until, isDaily });
      }
      continue;
    }

    const rpd = row.rpd_date === todayStr ? row.rpd_count || 0 : 0;
    const isSameWindow = now - (row.rpm_window_start || 0) <= 60_000;
    const rpm = isSameWindow ? row.rpm_count || 0 : 0;
    const windowStart = isSameWindow ? row.rpm_window_start || now : now;

    usageMap.set(`${row.api_key_id}_${row.model_name}`, { rpd, rpm, windowStart });
  }

  // Resolve target canonical model & build cascading fallback chain
  let modelsToTry: string[] = [];
  let originalModelName = requestedModel || "default";

  if (requestedModel) {
    const resolvedAlias = resolveModelAlias(requestedModel, discovery.models);
    originalModelName = resolvedAlias.id;
    modelsToTry = buildModelFallbackChain(requestedModel, discovery.models, action);
  } else {
    modelsToTry = ["__passthrough__"];
  }

  // Batched telemetry buffers flushed asynchronously via Next.js after()
  const keyDeltaMap = new Map<string, PendingKeyDelta>();
  const cooldownWriteMap = new Map<
    string,
    { apiKeyId: string; modelName: string; until: number; isDaily: boolean; statusCode: number }
  >();
  let successUsageWrite: {
    apiKeyId: string;
    modelName: string;
    windowStart: number;
  } | null = null;

  const queueKeyDelta = (
    keyId: string,
    inc: { requests?: number; errors?: number },
    updates: Record<string, unknown>
  ) => {
    const existing = keyDeltaMap.get(keyId) || { requests: 0, errors: 0, updates: {} };
    existing.requests += inc.requests || 0;
    existing.errors += inc.errors || 0;
    existing.updates = { ...existing.updates, ...updates };
    keyDeltaMap.set(keyId, existing);
  };

  const flushTelemetry = () => {
    const ops: Promise<void>[] = [];

    for (const [keyId, delta] of keyDeltaMap.entries()) {
      ops.push(
        updateKeyState(
          keyId,
          { requests: delta.requests, errors: delta.errors },
          delta.updates
        )
      );
    }

    for (const cd of cooldownWriteMap.values()) {
      ops.push(
        recordModelCooldown(
          userId,
          cd.apiKeyId,
          cd.modelName,
          todayStr,
          cd.until,
          cd.isDaily,
          cd.statusCode
        )
      );
    }

    if (successUsageWrite) {
      ops.push(
        recordModelUsage(
          userId,
          successUsageWrite.apiKeyId,
          successUsageWrite.modelName,
          todayStr,
          successUsageWrite.windowStart
        )
      );
    }

    if (ops.length === 0) return;

    try {
      after(async () => {
        await Promise.allSettled(ops);
      });
    } catch {
      void Promise.allSettled(ops);
    }
  };

  let preferredErrorResponse: NextResponse | null = null;
  let lastErrorResponse: NextResponse | null = null;
  const attemptedModels: string[] = [];

  // 6. Cascading Model Loop -> Key Pool Loop (strictly preserves tier order)
  for (let m = 0; m < modelsToTry.length; m++) {
    const currentModelName = modelsToTry[m];
    const isFallbackModel = m > 0;
    const isPassthrough = currentModelName === "__passthrough__";
    const hasMoreModels = m < modelsToTry.length - 1;
    const attemptNow = Date.now();

    // Skip briefly-overloaded model if we still have healthy models left in the chain
    if (!isPassthrough && hasMoreModels) {
      const overloadedUntil = hotOverloaded.get(currentModelName) || 0;
      if (overloadedUntil > attemptNow) {
        continue;
      }
      if (overloadedUntil > 0) {
        hotOverloaded.delete(currentModelName);
      }
    }

    const candidateKeys = keys
      .map((key) => {
        let keyRecovered = false;
        let effectiveStatus = key.status;

        const hotDeadUntil = hotDeadKeys.get(key.id) || 0;
        if (hotDeadUntil > attemptNow) {
          effectiveStatus = "dead";
        } else if (effectiveStatus === "cooling" && attemptNow > (key.cooldown_until || 0)) {
          effectiveStatus = "healthy";
          keyRecovered = true;
        }

        const pairKey = `${key.id}_${currentModelName}`;
        const dbCooldown = !isPassthrough && modelCooldownMap.has(pairKey);
        const hotCd = !isPassthrough ? hotCooldowns.get(pairKey) : undefined;
        const hotCooldownValid = Boolean(
          hotCd && hotCd.until > attemptNow && (!hotCd.isDaily || hotCd.todayStr === todayStr)
        );
        if (hotCd && !hotCooldownValid) {
          hotCooldowns.delete(pairKey);
        }

        const stats = !isPassthrough
          ? usageMap.get(pairKey) || { rpd: 0, rpm: 0, windowStart: attemptNow }
          : { rpd: 0, rpm: 0, windowStart: attemptNow };

        const inFlight = hotInFlight.get(pairKey) || 0;
        const burstRpm = getBurstCount(hotBurstRpm, pairKey, attemptNow);
        const keyTotalInFlight = hotInFlight.get(key.id) || 0;

        return {
          ...key,
          effectiveStatus,
          keyRecovered,
          pairCooling: dbCooldown || hotCooldownValid,
          modelRpd: stats.rpd,
          modelRpm: stats.rpm,
          effectiveRpm: Math.max(stats.rpm, burstRpm),
          inFlight,
          keyTotalInFlight,
          windowStart: stats.windowStart,
        };
      })
      .filter((k) => k.effectiveStatus === "healthy" && !k.pairCooling)
      .sort((a, b) => {
        // Spread concurrent requests evenly across all healthy keys first
        if (a.inFlight !== b.inFlight) return a.inFlight - b.inFlight;
        if (a.effectiveRpm !== b.effectiveRpm) return a.effectiveRpm - b.effectiveRpm;
        if (a.modelRpd !== b.modelRpd) return a.modelRpd - b.modelRpd;
        if (a.keyTotalInFlight !== b.keyTotalInFlight) {
          return a.keyTotalInFlight - b.keyTotalInFlight;
        }
        return (a.last_used || 0) - (b.last_used || 0);
      });

    if (candidateKeys.length === 0) {
      continue;
    }

    if (!isPassthrough) {
      attemptedModels.push(currentModelName);
    }

    for (const key of candidateKeys) {
      const attemptTimeoutMs =
        hasMoreModels && isFallbackModel ? FALLBACK_ATTEMPT_TIMEOUT_MS : BASE_ATTEMPT_TIMEOUT_MS;

      const pairKey = `${key.id}_${currentModelName}`;
      const dispatchTime = Date.now();
      hotInFlight.set(pairKey, (hotInFlight.get(pairKey) || 0) + 1);
      hotInFlight.set(key.id, (hotInFlight.get(key.id) || 0) + 1);
      bumpBurstCount(hotBurstRpm, pairKey, dispatchTime);

      try {
        const currentUrlPath =
          !isPassthrough && requestedModel
            ? substituteModelInUrlPath(urlPath, requestedModel, currentModelName)
            : urlPath;

        const targetUrlObj = new URL(
          `https://generativelanguage.googleapis.com/${currentUrlPath}`
        );

        reqUrl.searchParams.forEach((val, pKey) => {
          const lowerKey = pKey.toLowerCase();
          if (!["key", "path", "nxtp", "nxtppath"].includes(lowerKey)) {
            targetUrlObj.searchParams.append(pKey, val);
          }
        });
        targetUrlObj.searchParams.append("key", key.key_value);

        const currentPayload =
          !isPassthrough && requestedModel
            ? substituteModelInPayload(originalPayload, requestedModel, currentModelName)
            : originalPayload;

        const outboundHeaders = new Headers();
        req.headers.forEach((val, hKey) => {
          const lower = hKey.toLowerCase();
          if (
            ![
              "host",
              "connection",
              "x-goog-api-key",
              "authorization",
              "content-length",
              "accept-encoding",
            ].includes(lower)
          ) {
            outboundHeaders.set(hKey, val);
          }
        });

        const response = await fetch(targetUrlObj.toString(), {
          method: req.method,
          headers: outboundHeaders,
          body: currentPayload,
          signal: AbortSignal.timeout(attemptTimeoutMs),
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("content-length");

        const opNow = Date.now();

        if (response.ok) {
          queueKeyDelta(
            key.id,
            { requests: 1 },
            {
              last_used: opNow,
              ...(key.keyRecovered ? { status: "healthy", cooldown_until: null } : {}),
            }
          );

          if (!isPassthrough) {
            successUsageWrite = {
              apiKeyId: key.id,
              modelName: currentModelName,
              windowStart: key.windowStart,
            };
            responseHeaders.set("X-Gemprism-Model", currentModelName);
            responseHeaders.set("X-Gemprism-Original-Model", originalModelName);
            if (currentModelName !== originalModelName) {
              responseHeaders.set(
                "X-Gemprism-Fallback",
                `Requested ${requestedModel} (${originalModelName}); served by ${currentModelName}`
              );
            }
          }
          if (key.name) {
            responseHeaders.set("X-Gemprism-Key", key.name);
          }

          flushTelemetry();

          return new NextResponse(response.body, {
            status: response.status,
            headers: responseHeaders,
          });
        }

        const errorBody = await response.text();
        const errInfo = classifyErrorResponse(response.status, errorBody, opNow);

        const errorResponse = new NextResponse(errorBody, {
          status: response.status,
          headers: responseHeaders,
        });
        lastErrorResponse = errorResponse;

        if (errInfo.kind === "dead_key") {
          hotDeadKeys.set(key.id, opNow + 5 * 60_000);
          queueKeyDelta(
            key.id,
            { errors: 1, requests: 1 },
            {
              status: "dead",
              last_error: errInfo.reason,
              last_used: opNow,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          continue;
        }

        if (errInfo.kind === "balance_exhausted") {
          queueKeyDelta(
            key.id,
            { errors: 1, requests: 1 },
            {
              status: "cooling",
              cooldown_until: opNow + errInfo.cooldownMs,
              last_error: errInfo.reason,
              last_used: opNow,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          continue;
        }

        if (
          errInfo.kind === "limit_zero" ||
          errInfo.kind === "daily_exhausted" ||
          errInfo.kind === "minute_rate_limit"
        ) {
          const until = opNow + errInfo.cooldownMs;
          queueKeyDelta(
            key.id,
            { errors: 1, requests: 1 },
            {
              status: "healthy",
              cooldown_until: null,
              last_error: `${errInfo.reason} [${currentModelName}]`,
              last_used: opNow,
            }
          );

          if (!isPassthrough) {
            modelCooldownMap.set(pairKey, { until, isDaily: errInfo.isDaily });
            hotCooldowns.set(pairKey, {
              until,
              isDaily: errInfo.isDaily,
              todayStr,
              statusCode: response.status,
            });
            cooldownWriteMap.set(pairKey, {
              apiKeyId: key.id,
              modelName: currentModelName,
              until,
              isDaily: errInfo.isDaily,
              statusCode: response.status,
            });
          }

          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          continue;
        }

        if (errInfo.kind === "model_not_found") {
          queueKeyDelta(
            key.id,
            { errors: 1, requests: 1 },
            {
              last_error: `404 Model unavailable [${currentModelName}]`,
              last_used: opNow,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          break;
        }

        if (errInfo.kind === "overloaded") {
          queueKeyDelta(
            key.id,
            { errors: 1, requests: 1 },
            {
              last_error: `503 Overloaded [${currentModelName}]`,
              last_used: opNow,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;

          if (!isPassthrough && hasMoreModels) {
            hotOverloaded.set(currentModelName, opNow + OVERLOAD_CACHE_MS);
            break; // Cascade immediately to the next Flash/model tier
          }
          continue;
        }

        if (errInfo.kind === "server_error") {
          queueKeyDelta(
            key.id,
            { errors: 1, requests: 1 },
            {
              last_error: `${errInfo.reason} [${currentModelName}]`,
              last_used: opNow,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          continue;
        }

        // Client error (400 etc.)
        queueKeyDelta(
          key.id,
          { errors: 1, requests: 1 },
          {
            last_error: `API Error ${response.status} [${currentModelName}]`,
            last_used: opNow,
          }
        );

        if (!isFallbackModel) {
          flushTelemetry();
          return errorResponse;
        }

        // Skip incompatible fallback model and continue down the chain
        break;
      } catch (err: unknown) {
        const isTimeout =
          err instanceof Error &&
          (err.name === "TimeoutError" || err.name === "AbortError");
        const message = isTimeout
          ? `Upstream timeout (${Math.round(attemptTimeoutMs / 1000)}s) [${currentModelName}]`
          : err instanceof Error
            ? err.message
            : "Unknown network error";

        queueKeyDelta(key.id, { errors: 1 }, { last_error: message });
        lastErrorResponse = NextResponse.json(
          { error: message },
          { status: isTimeout ? 504 : 502 }
        );

        if (isTimeout && hasMoreModels) {
          if (!isPassthrough) {
            hotOverloaded.set(currentModelName, Date.now() + OVERLOAD_CACHE_MS);
          }
          break;
        }
        continue;
      } finally {
        hotInFlight.set(pairKey, Math.max(0, (hotInFlight.get(pairKey) || 1) - 1));
        hotInFlight.set(key.id, Math.max(0, (hotInFlight.get(key.id) || 1) - 1));
      }
    }
  }

  flushTelemetry();

  if (preferredErrorResponse) return preferredErrorResponse;
  if (lastErrorResponse) return lastErrorResponse;

  return NextResponse.json(
    {
      error: `All keys and fallback models are currently exhausted or cooling (${attemptedModels.join(", ") || originalModelName}).`,
      attempted_models: attemptedModels,
    },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}

export {
  handler as GET,
  handler as POST,
  handler as OPTIONS,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};

async function updateKeyState(
  id: string,
  increments: { requests?: number; errors?: number },
  updates: Record<string, unknown>
) {
  const admin = getSupabaseAdminClient();
  const { data: current } = await admin
    .from("api_keys")
    .select("total_requests, total_errors")
    .eq("id", id)
    .maybeSingle();

  const finalUpdates: Record<string, unknown> = { ...updates };
  if (increments.requests) {
    finalUpdates.total_requests = (current?.total_requests || 0) + increments.requests;
  }
  if (increments.errors) {
    finalUpdates.total_errors = (current?.total_errors || 0) + increments.errors;
  }

  const { error } = await admin.from("api_keys").update(finalUpdates).eq("id", id);
  if (error) console.error("[GemPrism] updateKeyState failed:", error.message);
}

async function recordModelUsage(
  userId: string,
  apiKeyId: string,
  modelName: string,
  todayStr: string,
  windowStart: number
) {
  const admin = getSupabaseAdminClient();

  const { data: current } = await admin
    .from("model_usage")
    .select("*")
    .eq("api_key_id", apiKeyId)
    .eq("model_name", modelName)
    .maybeSingle();

  const now = Date.now();
  let rpd = 1;
  let rpm = 1;
  let updatedWindowStart = windowStart;

  if (current) {
    const isToday = current.rpd_date === todayStr;
    const isSameWindow = now - (current.rpm_window_start || 0) <= 60_000;

    rpd = isToday ? (current.rpd_count || 0) + 1 : 1;
    rpm = isSameWindow ? (current.rpm_count || 0) + 1 : 1;
    updatedWindowStart = isSameWindow ? current.rpm_window_start : now;
  } else {
    updatedWindowStart = now;
  }

  const { error } = await admin.from("model_usage").upsert(
    {
      user_id: userId,
      api_key_id: apiKeyId,
      model_name: modelName,
      rpd_count: rpd,
      rpm_count: rpm,
      rpd_date: todayStr,
      rpm_window_start: updatedWindowStart,
    },
    { onConflict: "api_key_id,model_name" }
  );

  if (error) {
    console.error("[GemPrism] recordModelUsage failed:", error.message, error.details);
  }
}

async function recordModelCooldown(
  userId: string,
  apiKeyId: string,
  modelName: string,
  todayStr: string,
  untilMs: number,
  isDaily: boolean,
  statusCode: number
) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("model_usage").upsert(
    {
      user_id: userId,
      api_key_id: apiKeyId,
      model_name: `${COOLDOWN_PREFIX}${modelName}`,
      rpd_count: isDaily ? 1 : 0,
      rpm_count: statusCode,
      rpd_date: todayStr,
      rpm_window_start: untilMs,
    },
    { onConflict: "api_key_id,model_name" }
  );

  if (error) {
    console.error("[GemPrism] recordModelCooldown failed:", error.message);
  }
}