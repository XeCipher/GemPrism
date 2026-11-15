import { NextResponse } from "next/server";
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

const COOLDOWN_PREFIX = "__cooldown:";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractModelFromRequest(
  urlPath: string,
  payloadBuffer?: ArrayBuffer
): { requestedModel: string | null; action: string | null; isBodyModel: boolean } {
  const pathMatch = urlPath.match(/models\/([^/:]+)(?::([^/?]+))?/);
  if (pathMatch) {
    return {
      requestedModel: pathMatch[1],
      action: pathMatch[2] || "generateContent",
      isBodyModel: false,
    };
  }

  // Handle newer endpoints like v1beta/interactions where model lives inside JSON body
  if (payloadBuffer && payloadBuffer.byteLength > 0) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(payloadBuffer)) as { model?: string };
      if (typeof parsed.model === "string" && parsed.model.trim()) {
        return {
          requestedModel: parsed.model.replace(/^models\//i, "").trim(),
          action: "generateContent",
          isBodyModel: true,
        };
      }
    } catch {
      // Non-JSON body; proceed transparently
    }
  }

  return { requestedModel: null, action: null, isBodyModel: false };
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

  // 3. Read request body & resolve path
  const resolvedParams = await params;
  const urlPath = resolvedParams.path.join("/");
  const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const originalPayload = hasBody ? await req.arrayBuffer() : undefined;

  const { requestedModel, action } = extractModelFromRequest(urlPath, originalPayload);

  // 4. Fetch Key Pool & Full Per-User Telemetry
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

  // 5. Dynamically discover live models from Gemini API (cached 15 min per user)
  const historicalModelIds = usageRows.map((u) => u.model_name);
  let discovery = await discoverModelsForKeys(keys, {
    userId,
    historicalModelIds,
  });

  // If the client requests a brand-new model not yet in our cache, trigger one live refresh
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

  // Index live usage counts and per-(key, model) active cooldowns
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

  // Resolve target canonical model & cascading fallback chain
  let modelsToTry: string[] = [];
  let originalModelName = requestedModel || "default";

  if (requestedModel) {
    const resolvedAlias = resolveModelAlias(requestedModel, discovery.models);
    originalModelName = resolvedAlias.id;
    modelsToTry = buildModelFallbackChain(requestedModel, discovery.models, action);
  } else {
    modelsToTry = ["__passthrough__"];
  }

  let preferredErrorResponse: NextResponse | null = null;
  let lastErrorResponse: NextResponse | null = null;
  const attemptedModels: string[] = [];

  // 6. Cascading Model Loop -> Key Pool Loop
  for (let m = 0; m < modelsToTry.length; m++) {
    const currentModelName = modelsToTry[m];
    const isFallbackModel = m > 0;
    const isPassthrough = currentModelName === "__passthrough__";

    if (!isPassthrough) {
      attemptedModels.push(currentModelName);
    }

    // Build sorted candidate keys for this specific model (skipping cooling key+model pairs)
    const candidateKeys = keys
      .map((key) => {
        let keyRecovered = false;
        let effectiveStatus = key.status;

        if (effectiveStatus === "cooling" && now > (key.cooldown_until || 0)) {
          effectiveStatus = "healthy";
          keyRecovered = true;
        }

        const pairCooling = !isPassthrough
          ? modelCooldownMap.has(`${key.id}_${currentModelName}`)
          : false;

        const stats = !isPassthrough
          ? usageMap.get(`${key.id}_${currentModelName}`) || {
              rpd: 0,
              rpm: 0,
              windowStart: now,
            }
          : { rpd: 0, rpm: 0, windowStart: now };

        return {
          ...key,
          effectiveStatus,
          keyRecovered,
          pairCooling,
          modelRpd: stats.rpd,
          modelRpm: stats.rpm,
          windowStart: stats.windowStart,
        };
      })
      .filter((k) => k.effectiveStatus === "healthy" && !k.pairCooling)
      .sort((a, b) => {
        if (a.modelRpd !== b.modelRpd) return a.modelRpd - b.modelRpd;
        if (a.modelRpm !== b.modelRpm) return a.modelRpm - b.modelRpm;
        return (a.last_used || 0) - (b.last_used || 0);
      });

    if (candidateKeys.length === 0) {
      // Every key is dead or already in cooldown for this specific model -> cascade immediately
      continue;
    }

    let overloadedHitsOnModel = 0;

    for (const key of candidateKeys) {
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
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("content-length");

        if (response.ok) {
          // Record successful execution telemetry
          const telemetryOps: Promise<void>[] = [
            updateKeyState(
              key.id,
              { requests: 1 },
              {
                last_used: now,
                ...(key.keyRecovered ? { status: "healthy", cooldown_until: null } : {}),
              }
            ),
          ];

          if (!isPassthrough) {
            telemetryOps.push(
              recordModelUsage(userId, key.id, currentModelName, todayStr, key.windowStart)
            );
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

          await Promise.all(telemetryOps).catch((err) =>
            console.error("[GemPrism] Telemetry update warning:", err)
          );

          return new NextResponse(response.body, {
            status: response.status,
            headers: responseHeaders,
          });
        }

        // Handle upstream error status intelligently
        const errorBody = await response.text();
        const errInfo = classifyErrorResponse(response.status, errorBody, now);

        const errorResponse = new NextResponse(errorBody, {
          status: response.status,
          headers: responseHeaders,
        });
        lastErrorResponse = errorResponse;

        if (errInfo.kind === "dead_key") {
          await updateKeyState(
            key.id,
            { errors: 1, requests: 1 },
            {
              status: "dead",
              last_error: errInfo.reason,
              last_used: now,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          continue; // Try next key on same model
        }

        if (errInfo.kind === "balance_exhausted") {
          await updateKeyState(
            key.id,
            { errors: 1, requests: 1 },
            {
              status: "cooling",
              cooldown_until: now + errInfo.cooldownMs,
              last_error: errInfo.reason,
              last_used: now,
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
          const until = now + errInfo.cooldownMs;
          const ops: Promise<void>[] = [
            updateKeyState(
              key.id,
              { errors: 1, requests: 1 },
              {
                // Keep api_keys.status healthy so other models continue working on this key
                status: "healthy",
                cooldown_until: null,
                last_error: `${errInfo.reason} [${currentModelName}]`,
                last_used: now,
              }
            ),
          ];

          if (!isPassthrough) {
            modelCooldownMap.set(`${key.id}_${currentModelName}`, {
              until,
              isDaily: errInfo.isDaily,
            });
            ops.push(
              recordModelCooldown(
                userId,
                key.id,
                currentModelName,
                todayStr,
                until,
                errInfo.isDaily,
                response.status
              )
            );
          }

          await Promise.all(ops).catch((err) =>
            console.error("[GemPrism] Cooldown persist error:", err)
          );

          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          continue; // Try next key; if all keys fail, model loop advances automatically
        }

        if (errInfo.kind === "model_not_found") {
          await updateKeyState(
            key.id,
            { errors: 1, requests: 1 },
            {
              last_error: `404 Model unavailable [${currentModelName}]`,
              last_used: now,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          break; // Model does not exist on Google; jump immediately to next fallback model
        }

        if (errInfo.kind === "overloaded") {
          overloadedHitsOnModel++;
          await updateKeyState(
            key.id,
            { errors: 1, requests: 1 },
            {
              last_error: `503 Overloaded [${currentModelName}]`,
              last_used: now,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;

          // Try at most 1 backup key on 503, then degrade to next model so latency stays low
          if (overloadedHitsOnModel >= 2 || candidateKeys.length === 1) {
            break;
          }
          continue;
        }

        if (errInfo.kind === "server_error") {
          await updateKeyState(
            key.id,
            { errors: 1, requests: 1 },
            {
              last_error: `${errInfo.reason} [${currentModelName}]`,
              last_used: now,
            }
          );
          if (!preferredErrorResponse) preferredErrorResponse = errorResponse;
          continue; // Try next key on transient 5xx
        }

        // Client error (400 etc.)
        await updateKeyState(
          key.id,
          { errors: 1, requests: 1 },
          {
            last_error: `API Error ${response.status} [${currentModelName}]`,
            last_used: now,
          }
        );

        if (!isFallbackModel) {
          // Primary requested model rejected the request as malformed -> return 400 immediately
          return errorResponse;
        }

        // A fallback model (e.g. older Flash or Gemma) may not support a newer feature like thinkingConfig.
        // Skip this incompatible fallback model and try the next candidate instead of failing!
        break;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown network error";
        await updateKeyState(key.id, { errors: 1 }, { last_error: message }).catch(() => {});
        lastErrorResponse = NextResponse.json({ error: message }, { status: 502 });
        continue;
      }
    }
  }

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