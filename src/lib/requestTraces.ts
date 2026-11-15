import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getQuotaResetDateStr } from "@/lib/geminiModels";

export const TRACE_PREFIX = "__trace:";

export type TraceFallbackType = "direct" | "key_failover" | "model_fallback" | "failed";
export type TraceStorageMode = "request_logs" | "compat";
export type RequestTraceFilter = "all" | "fallbacks" | "errors";

export type HopOutcome =
  | "success"
  | "rate_limited"
  | "overloaded"
  | "not_found"
  | "dead_key"
  | "balance_exhausted"
  | "timeout"
  | "client_error"
  | "server_error"
  | "skipped";

export interface RequestHop {
  index: number;
  type: "attempt" | "skip";
  model: string;
  keyId: string | null;
  keyName: string | null;
  startOffsetMs: number;
  durationMs: number;
  httpStatus: number;
  outcome: HopOutcome;
  reason: string;
}

export interface RequestModelStep {
  model: string;
  status: "settled" | "skipped" | "exhausted" | "overloaded" | "not_found" | "error";
  durationMs: number;
  attempts: number;
  keysTried: string[];
  note: string;
}

export interface RequestPhaseTimings {
  authMs: number;
  poolFetchMs: number;
  discoveryMs: number;
  gatewayOverheadMs: number;
  upstreamFailedMs: number;
  upstreamSettledMs: number;
}

export interface RequestTrace {
  id: string;
  userId: string;
  receivedAt: number;
  receivedAtIso: string;
  method: string;
  endpointPath: string;
  action: string | null;
  isStreaming: boolean;
  isPassthrough: boolean;
  requestedModel: string;
  resolvedModel: string;
  settledModel: string | null;
  settledKeyName: string | null;
  statusCode: number;
  success: boolean;
  fallbackType: TraceFallbackType;
  didFallback: boolean;
  totalDurationMs: number;
  phases: RequestPhaseTimings;
  plannedChain: string[];
  modelsTraversed: RequestModelStep[];
  hops: RequestHop[];
  errorSummary: string | null;
}

export interface RequestTraceQueryOptions {
  limit?: number;
  offset?: number;
  filter?: RequestTraceFilter;
  search?: string;
}

export interface RequestTracePageResult {
  traces: RequestTrace[];
  total: number;
  hasMore: boolean;
  storageMode: TraceStorageMode;
}

interface CompactHop {
  i: number;
  t: "a" | "s";
  m: string;
  k: string | null;
  o: number;
  d: number;
  s: number;
  c: HopOutcome;
  r: string;
}

interface CompactStep {
  m: string;
  s: RequestModelStep["status"];
  d: number;
  a: number;
  k: string[];
  n: string;
}

interface CompactTrace {
  v: 1;
  id: string;
  ra: number;
  m: string;
  ep: string;
  ac: string | null;
  st: boolean;
  pt: boolean;
  rm: string;
  vm: string;
  sm: string | null;
  sk: string | null;
  sc: number;
  ok: boolean;
  ft: TraceFallbackType;
  df: boolean;
  td: number;
  ph: RequestPhaseTimings;
  pc: string[];
  mt: CompactStep[];
  hp: CompactHop[];
  es: string | null;
}

const MAX_HOT_TRACES = 40;
const MAX_COMPAT_DB_TRACES = 15;
const MAX_COMPAT_KEY_BYTES = 1600;

const traceGlobal = globalThis as typeof globalThis & {
  __gemprismRecentTraces?: Map<string, RequestTrace[]>;
  __gemprismRequestLogsStatus?: { available: boolean; checkedAt: number };
};

function getHotTraceStore(): Map<string, RequestTrace[]> {
  if (!traceGlobal.__gemprismRecentTraces) {
    traceGlobal.__gemprismRecentTraces = new Map();
  }
  return traceGlobal.__gemprismRecentTraces;
}

function pushToHotStore(userId: string, trace: RequestTrace) {
  const store = getHotTraceStore();
  const existing = store.get(userId) || [];
  const next = [trace, ...existing.filter((t) => t.id !== trace.id)].slice(0, MAX_HOT_TRACES);
  store.set(userId, next);
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = (error.code || "").toUpperCase();
  const msg = (error.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (msg.includes("request_logs") &&
      (msg.includes("does not exist") ||
        msg.includes("could not find") ||
        msg.includes("schema cache")))
  );
}

function truncateText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 1))}…`;
}

function matchesTraceQuery(
  trace: RequestTrace,
  filter: RequestTraceFilter,
  searchLower: string
): boolean {
  if (filter === "fallbacks" && !trace.didFallback) return false;
  if (filter === "errors" && trace.success) return false;

  if (searchLower) {
    const haystack = `${trace.requestedModel} ${trace.resolvedModel} ${trace.settledModel || ""} ${
      trace.settledKeyName || ""
    } ${trace.endpointPath}`.toLowerCase();
    if (!haystack.includes(searchLower)) return false;
  }

  return true;
}

/**
 * Serializes a trace into <= 1600 UTF-8 characters so it safely fits inside
 * PostgreSQL's unique B-tree index on model_usage(api_key_id, model_name)
 * if the request_logs table hasn't been created yet.
 */
function buildCompatModelName(trace: RequestTrace): string {
  const basePrefix = `${TRACE_PREFIX}${trace.id}:`;

  const encode = (
    maxReasonLen: number,
    maxChainLen: number,
    hops: RequestHop[],
    steps: RequestModelStep[],
    errLimit: number
  ): string => {
    const compact: CompactTrace = {
      v: 1,
      id: trace.id,
      ra: trace.receivedAt,
      m: trace.method,
      ep: truncateText(trace.endpointPath, 96),
      ac: trace.action,
      st: trace.isStreaming,
      pt: trace.isPassthrough,
      rm: trace.requestedModel,
      vm: trace.resolvedModel,
      sm: trace.settledModel,
      sk: trace.settledKeyName,
      sc: trace.statusCode,
      ok: trace.success,
      ft: trace.fallbackType,
      df: trace.didFallback,
      td: trace.totalDurationMs,
      ph: trace.phases,
      pc: trace.plannedChain.slice(0, maxChainLen),
      mt: steps.map((s) => ({
        m: s.model,
        s: s.status,
        d: s.durationMs,
        a: s.attempts,
        k: s.keysTried.slice(0, 4),
        n: truncateText(s.note, maxReasonLen),
      })),
      hp: hops.map((h) => ({
        i: h.index,
        t: h.type === "attempt" ? "a" : "s",
        m: h.model,
        k: h.keyName,
        o: h.startOffsetMs,
        d: h.durationMs,
        s: h.httpStatus,
        c: h.outcome,
        r: truncateText(h.reason, maxReasonLen),
      })),
      es: trace.errorSummary ? truncateText(trace.errorSummary, errLimit) : null,
    };

    return `${basePrefix}${JSON.stringify(compact)}`;
  };

  let candidate = encode(56, 10, trace.hops, trace.modelsTraversed, 120);
  if (candidate.length <= MAX_COMPAT_KEY_BYTES) return candidate;

  candidate = encode(36, 6, trace.hops.slice(0, 12), trace.modelsTraversed.slice(0, 10), 80);
  if (candidate.length <= MAX_COMPAT_KEY_BYTES) return candidate;

  // Keep first few and final few hops so origin and settlement stay intact
  const trimmedHops =
    trace.hops.length > 6
      ? [...trace.hops.slice(0, 3), ...trace.hops.slice(-3)]
      : trace.hops;

  candidate = encode(24, 4, trimmedHops, trace.modelsTraversed.slice(0, 6), 48);
  if (candidate.length <= MAX_COMPAT_KEY_BYTES) return candidate;

  return encode(16, 2, trace.hops.slice(-2), trace.modelsTraversed.slice(-3), 32);
}

export function parseCompatTraceRow(userId: string, modelName: string): RequestTrace | null {
  if (!modelName.startsWith(TRACE_PREFIX)) return null;
  const rest = modelName.slice(TRACE_PREFIX.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return null;

  const jsonPart = rest.slice(colonIdx + 1);
  try {
    const c = JSON.parse(jsonPart) as CompactTrace;
    if (!c || c.v !== 1 || !c.id) return null;

    return {
      id: c.id,
      userId,
      receivedAt: c.ra,
      receivedAtIso: new Date(c.ra).toISOString(),
      method: c.m,
      endpointPath: c.ep,
      action: c.ac,
      isStreaming: Boolean(c.st),
      isPassthrough: Boolean(c.pt),
      requestedModel: c.rm,
      resolvedModel: c.vm,
      settledModel: c.sm,
      settledKeyName: c.sk,
      statusCode: c.sc,
      success: c.ok,
      fallbackType: c.ft,
      didFallback: c.df,
      totalDurationMs: c.td,
      phases: c.ph,
      plannedChain: Array.isArray(c.pc) ? c.pc : [],
      modelsTraversed: Array.isArray(c.mt)
        ? c.mt.map((s) => ({
            model: s.m,
            status: s.s,
            durationMs: s.d,
            attempts: s.a,
            keysTried: Array.isArray(s.k) ? s.k : [],
            note: s.n,
          }))
        : [],
      hops: Array.isArray(c.hp)
        ? c.hp.map((h) => ({
            index: h.i,
            type: h.t === "a" ? "attempt" : "skip",
            model: h.m,
            keyId: null,
            keyName: h.k,
            startOffsetMs: h.o,
            durationMs: h.d,
            httpStatus: h.s,
            outcome: h.c,
            reason: h.r,
          }))
        : [],
      errorSummary: c.es,
    };
  } catch {
    return null;
  }
}

export async function saveRequestTrace(
  userId: string,
  fallbackKeyId: string | undefined,
  trace: RequestTrace
): Promise<void> {
  pushToHotStore(userId, trace);

  const admin = getSupabaseAdminClient();
  const tableStatus = traceGlobal.__gemprismRequestLogsStatus;
  const shouldTryTable =
    !tableStatus || tableStatus.available || Date.now() - tableStatus.checkedAt > 60_000;

  if (shouldTryTable) {
    const { error } = await admin.from("request_logs").insert({
      user_id: userId,
      received_at: trace.receivedAt,
      trace_data: trace,
    });

    if (!error) {
      traceGlobal.__gemprismRequestLogsStatus = { available: true, checkedAt: Date.now() };
      return;
    }

    if (isMissingTableError(error)) {
      traceGlobal.__gemprismRequestLogsStatus = { available: false, checkedAt: Date.now() };
    } else {
      console.error("[GemPrism] request_logs insert failed:", error.message);
    }
  }

  // Fallback into model_usage only when request_logs table is absent
  if (!fallbackKeyId) return;

  const compatName = buildCompatModelName(trace);
  const todayStr = getQuotaResetDateStr(new Date(trace.receivedAt));

  const { error: compatErr } = await admin.from("model_usage").upsert(
    {
      user_id: userId,
      api_key_id: fallbackKeyId,
      model_name: compatName,
      rpd_count: trace.totalDurationMs,
      rpm_count: trace.statusCode,
      rpd_date: todayStr,
      rpm_window_start: trace.receivedAt,
    },
    { onConflict: "api_key_id,model_name" }
  );

  if (compatErr) {
    console.error("[GemPrism] compat trace insert failed:", compatErr.message);
    return;
  }

  const { data: existingCompat } = await admin
    .from("model_usage")
    .select("id, rpm_window_start")
    .eq("user_id", userId)
    .like("model_name", `${TRACE_PREFIX}%`)
    .order("rpm_window_start", { ascending: false });

  if (existingCompat && existingCompat.length > MAX_COMPAT_DB_TRACES) {
    const idsToDelete = existingCompat
      .slice(MAX_COMPAT_DB_TRACES)
      .map((r) => r.id as string);
    if (idsToDelete.length > 0) {
      await admin.from("model_usage").delete().in("id", idsToDelete);
    }
  }
}

export async function getRequestTracesPage(
  userId: string,
  options: RequestTraceQueryOptions = {}
): Promise<RequestTracePageResult> {
  const limit = Math.min(Math.max(1, Math.floor(options.limit ?? 30)), 100);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const filter: RequestTraceFilter =
    options.filter === "fallbacks" || options.filter === "errors" ? options.filter : "all";
  const rawSearch = (options.search ?? "").trim();
  const searchLower = rawSearch.toLowerCase();

  const admin = getSupabaseAdminClient();
  const hotTraces = getHotTraceStore().get(userId) || [];

  const tableStatus = traceGlobal.__gemprismRequestLogsStatus;
  const shouldTryTable =
    !tableStatus || tableStatus.available || Date.now() - tableStatus.checkedAt > 60_000;

  if (shouldTryTable) {
    const safeSearch = rawSearch.replace(/[%_*,()"'\\]/g, "").trim();

    if (rawSearch && !safeSearch) {
      traceGlobal.__gemprismRequestLogsStatus = { available: true, checkedAt: Date.now() };
      return { traces: [], total: 0, hasMore: false, storageMode: "request_logs" };
    }

    let query = admin
      .from("request_logs")
      .select("trace_data", { count: "exact" })
      .eq("user_id", userId);

    if (filter === "fallbacks") {
      query = query.contains("trace_data", { didFallback: true });
    } else if (filter === "errors") {
      query = query.contains("trace_data", { success: false });
    }

    if (safeSearch) {
      const pattern = `"*${safeSearch}*"`;
      query = query.or(
        [
          `trace_data->>requestedModel.ilike.${pattern}`,
          `trace_data->>resolvedModel.ilike.${pattern}`,
          `trace_data->>settledModel.ilike.${pattern}`,
          `trace_data->>settledKeyName.ilike.${pattern}`,
          `trace_data->>endpointPath.ilike.${pattern}`,
        ].join(",")
      );
    }

    const { data, error, count } = await query
      .order("received_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!error && Array.isArray(data)) {
      traceGlobal.__gemprismRequestLogsStatus = { available: true, checkedAt: Date.now() };

      const dbTraces: RequestTrace[] = [];
      for (const row of data) {
        const t = row.trace_data as RequestTrace | null;
        if (t && t.id) dbTraces.push(t);
      }

      let finalTraces = dbTraces;
      let finalTotal = count ?? dbTraces.length;

      // Include freshly finished in-memory traces that are still flushing via after()
      if (offset === 0) {
        const now = Date.now();
        const dbIds = new Set(dbTraces.map((t) => t.id));
        const pendingHot = hotTraces.filter(
          (t) =>
            !dbIds.has(t.id) &&
            now - t.receivedAt < 15_000 &&
            matchesTraceQuery(t, filter, searchLower)
        );
        if (pendingHot.length > 0) {
          finalTraces = [...pendingHot, ...dbTraces]
            .sort((a, b) =>
              b.receivedAt !== a.receivedAt
                ? b.receivedAt - a.receivedAt
                : a.id.localeCompare(b.id)
            )
            .slice(0, limit);
          finalTotal += pendingHot.length;
        }
      }

      const hasMore =
        offset + dbTraces.length < (count ?? dbTraces.length) ||
        offset + finalTraces.length < finalTotal;

      return {
        traces: finalTraces,
        total: Math.max(finalTotal, finalTraces.length),
        hasMore,
        storageMode: "request_logs",
      };
    }

    if (isMissingTableError(error)) {
      traceGlobal.__gemprismRequestLogsStatus = { available: false, checkedAt: Date.now() };
    } else if (error && safeSearch) {
      // Fallback: filter recent rows in JS if PostgREST rejects a search expression
      let fallbackQuery = admin
        .from("request_logs")
        .select("trace_data")
        .eq("user_id", userId);

      if (filter === "fallbacks") {
        fallbackQuery = fallbackQuery.contains("trace_data", { didFallback: true });
      } else if (filter === "errors") {
        fallbackQuery = fallbackQuery.contains("trace_data", { success: false });
      }

      const { data: fallbackRows, error: fallbackErr } = await fallbackQuery
        .order("received_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);

      if (!fallbackErr && Array.isArray(fallbackRows)) {
        const matched = fallbackRows
          .map((r) => r.trace_data as RequestTrace | null)
          .filter((t): t is RequestTrace =>
            Boolean(t && t.id && matchesTraceQuery(t, filter, searchLower))
          );
        const sliced = matched.slice(offset, offset + limit);
        return {
          traces: sliced,
          total: matched.length,
          hasMore: offset + sliced.length < matched.length,
          storageMode: "request_logs",
        };
      }
    }
  }

  // Fallback read from model_usage + hot memory when request_logs does not exist yet
  const merged = new Map<string, RequestTrace>();
  for (const t of hotTraces) {
    merged.set(t.id, t);
  }

  const { data: compatRows } = await admin
    .from("model_usage")
    .select("model_name")
    .eq("user_id", userId)
    .like("model_name", `${TRACE_PREFIX}%`)
    .order("rpm_window_start", { ascending: false })
    .limit(MAX_COMPAT_DB_TRACES);

  for (const row of compatRows || []) {
    const parsed = parseCompatTraceRow(userId, row.model_name as string);
    if (parsed && !merged.has(parsed.id)) {
      merged.set(parsed.id, parsed);
    }
  }

  const allMatching = Array.from(merged.values())
    .filter((t) => matchesTraceQuery(t, filter, searchLower))
    .sort((a, b) =>
      b.receivedAt !== a.receivedAt ? b.receivedAt - a.receivedAt : a.id.localeCompare(b.id)
    );

  const sliced = allMatching.slice(offset, offset + limit);

  return {
    traces: sliced,
    total: allMatching.length,
    hasMore: offset + sliced.length < allMatching.length,
    storageMode: "compat",
  };
}

export async function getRecentRequestTraces(
  userId: string,
  limit: number = 30
): Promise<{ traces: RequestTrace[]; storageMode: TraceStorageMode }> {
  const page = await getRequestTracesPage(userId, { limit, offset: 0 });
  return { traces: page.traces, storageMode: page.storageMode };
}

export async function clearRequestTraces(userId: string): Promise<void> {
  getHotTraceStore().delete(userId);
  const admin = getSupabaseAdminClient();

  const tableStatus = traceGlobal.__gemprismRequestLogsStatus;
  if (!tableStatus || tableStatus.available) {
    const { error } = await admin.from("request_logs").delete().eq("user_id", userId);
    if (error && isMissingTableError(error)) {
      traceGlobal.__gemprismRequestLogsStatus = { available: false, checkedAt: Date.now() };
    }
  }

  await admin
    .from("model_usage")
    .delete()
    .eq("user_id", userId)
    .like("model_name", `${TRACE_PREFIX}%`);
}