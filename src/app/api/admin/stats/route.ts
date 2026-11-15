import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { discoverModelsForKeys, getQuotaResetDateStr } from "@/lib/geminiModels";
import { getRequestTracesPage, TRACE_PREFIX } from "@/lib/requestTraces";

export const runtime = "nodejs";
export const maxDuration = 300;

const COOLDOWN_PREFIX = "__cooldown:";

interface RawKeyRow {
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
  created_at?: string;
}

interface RawUsageRow {
  id: string;
  user_id: string;
  api_key_id: string;
  model_name: string;
  rpd_count: number | null;
  rpm_count: number | null;
  rpd_date: string | null;
  rpm_window_start: number | null;
}

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userAuth, error } = await supabaseAdmin.auth.getUser(authHeader);
    if (error || !userAuth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = userAuth.user.id;

    const [tokenReq, keysReq, usageReq, traceResult] = await Promise.all([
      supabaseAdmin.from("gateway_tokens").select("token").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("api_keys").select("*").eq("user_id", userId),
      supabaseAdmin.from("model_usage").select("*").eq("user_id", userId),
      getRequestTracesPage(userId, { limit: 30, offset: 0 }),
    ]);

    let userToken = tokenReq.data?.token;
    if (!userToken) {
      userToken = `gp_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
      await supabaseAdmin.from("gateway_tokens").insert({ user_id: userId, token: userToken });
    }

    const keys = ((keysReq.data || []) as RawKeyRow[]).sort((a, b) => {
      const nameCmp = (a.name || "").localeCompare(b.name || "");
      return nameCmp !== 0 ? nameCmp : a.id.localeCompare(b.id);
    });
    const allRows = (usageReq.data || []) as RawUsageRow[];

    const now = Date.now();
    const todayStr = getQuotaResetDateStr();

    const usage: Array<{
      api_key_id: string;
      model_name: string;
      rpd_count: number;
      rpm_count: number;
      rpd_date: string | null;
      rpm_window_start: number | null;
    }> = [];

    const cooldowns: Array<{
      api_key_id: string;
      model_name: string;
      until: number;
      reason: "daily" | "minute";
      status_code: number;
    }> = [];

    for (const row of allRows) {
      if (row.model_name.startsWith(TRACE_PREFIX)) {
        continue;
      }

      if (row.model_name.startsWith(COOLDOWN_PREFIX)) {
        const modelName = row.model_name.slice(COOLDOWN_PREFIX.length);
        const until = row.rpm_window_start || 0;
        const isDaily = (row.rpd_count || 0) > 0;
        const isValidToday = !isDaily || row.rpd_date === todayStr;

        if (until > now && isValidToday) {
          cooldowns.push({
            api_key_id: row.api_key_id,
            model_name: modelName,
            until,
            reason: isDaily ? "daily" : "minute",
            status_code: row.rpm_count || 429,
          });
        }
        continue;
      }

      const rpdCount = row.rpd_date === todayStr ? row.rpd_count || 0 : 0;
      const rpmCount =
        row.rpm_window_start && now - row.rpm_window_start <= 60_000 ? row.rpm_count || 0 : 0;

      usage.push({
        api_key_id: row.api_key_id,
        model_name: row.model_name,
        rpd_count: rpdCount,
        rpm_count: rpmCount,
        rpd_date: row.rpd_date,
        rpm_window_start: row.rpm_window_start,
      });
    }

    // Deterministic ordering keeps chart bars, segments, and heatmap columns stable across polls
    usage.sort((a, b) => {
      const kCmp = a.api_key_id.localeCompare(b.api_key_id);
      return kCmp !== 0 ? kCmp : a.model_name.localeCompare(b.model_name);
    });
    cooldowns.sort((a, b) => {
      const kCmp = a.api_key_id.localeCompare(b.api_key_id);
      return kCmp !== 0 ? kCmp : a.model_name.localeCompare(b.model_name);
    });

    const discovery = await discoverModelsForKeys(keys, {
      userId,
      forceRefresh,
      historicalModelIds: usage.map((u) => u.model_name),
    });

    const cooldownsByKey = new Map<string, typeof cooldowns>();
    for (const cd of cooldowns) {
      const list = cooldownsByKey.get(cd.api_key_id) || [];
      list.push(cd);
      cooldownsByKey.set(cd.api_key_id, list);
    }

    const hydratedKeys = keys.map((k) => {
      let currentStatus = k.status;
      if (currentStatus === "cooling" && k.cooldown_until && now > k.cooldown_until) {
        currentStatus = "healthy";
      }
      const keyCooldowns = cooldownsByKey.get(k.id) || [];
      return {
        ...k,
        status: currentStatus,
        cooling_models: keyCooldowns,
        key_value: `${k.key_value.slice(0, 6)}••••••••${k.key_value.slice(-4)}`,
      };
    });

    const todayRequests = usage.reduce((sum, u) => sum + u.rpd_count, 0);
    const activeRpm = usage.reduce((sum, u) => sum + u.rpm_count, 0);
    const totalRequests = hydratedKeys.reduce((sum, k) => sum + (k.total_requests || 0), 0);
    const totalErrors = hydratedKeys.reduce((sum, k) => sum + (k.total_errors || 0), 0);

    return NextResponse.json({
      token: userToken,
      keys: hydratedKeys,
      models: discovery.models,
      catalogMeta: discovery.meta,
      usage,
      cooldowns,
      traces: traceResult.traces,
      tracesTotal: traceResult.total,
      tracesHasMore: traceResult.hasMore,
      todayStr,
      summary: {
        total_requests: totalRequests,
        today_requests: todayRequests,
        active_rpm: activeRpm,
        total_errors: totalErrors,
        active: hydratedKeys.filter((k) => k.status === "healthy").length,
        cooling: hydratedKeys.filter(
          (k) => k.status === "cooling" || (k.status === "healthy" && k.cooling_models.length > 0)
        ).length,
        dead: hydratedKeys.filter((k) => k.status === "dead").length,
        discovered_models: discovery.models.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GemPrism Admin Stats Error]:", message);
    return NextResponse.json(
      { error: "Server configuration error.", message },
      { status: 500 }
    );
  }
}