import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getQuotaResetDateStr } from "@/lib/geminiModels";

export const TRACE_PREFIX = "__trace:";

export type TraceFallbackType = "direct" | "key_failover" | "model_fallback" | "failed";
export type TraceStorageMode = "request_logs" | "compat";

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
    msg.includes("request_logs") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

function truncateText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * Serializes a trace into <= 1600 UTF-8 characters so it safely fits inside
 * PostgreSQL's unique B-tree index on model_usage(api_key_id, model_name)
 * whenever the optional request_logs table hasn't been created yet.
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

  // Transparent compat fallback in model_usage when request_logs table does not exist yet
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

  // Keep only the newest MAX_COMPAT_DB_TRACES fallback rows per user
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

export async function getRecentRequestTraces(
  userId: string,
  limit: number = 30
): Promise<{ traces: RequestTrace[]; storageMode: TraceStorageMode }> {
  const admin = getSupabaseAdminClient();
  const hotTraces = getHotTraceStore().get(userId) || [];
  const merged = new Map<string, RequestTrace>();

  for (const t of hotTraces) {
    merged.set(t.id, t);
  }

  let storageMode: TraceStorageMode = "compat";
  const tableStatus = traceGlobal.__gemprismRequestLogsStatus;
  const shouldTryTable =
    !tableStatus || tableStatus.available || Date.now() - tableStatus.checkedAt > 60_000;

  if (shouldTryTable) {
    const { data, error } = await admin
      .from("request_logs")
      .select("trace_data")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data)) {
      traceGlobal.__gemprismRequestLogsStatus = { available: true, checkedAt: Date.now() };
      storageMode = "request_logs";

      for (const row of data) {
        const t = row.trace_data as RequestTrace | null;
        if (!t || !t.id) continue;
        const existing = merged.get(t.id);
        if (!existing || t.hops.length > existing.hops.length) {
          merged.set(t.id, t);
        }
      }
    } else if (isMissingTableError(error)) {
      traceGlobal.__gemprismRequestLogsStatus = { available: false, checkedAt: Date.now() };
    }
  }

  if (storageMode === "compat") {
    const { data: compatRows } = await admin
      .from("model_usage")
      .select("model_name")
      .eq("user_id", userId)
      .like("model_name", `${TRACE_PREFIX}%`)
      .order("rpm_window_start", { ascending: false })
      .limit(limit);

    for (const row of compatRows || []) {
      const parsed = parseCompatTraceRow(userId, row.model_name as string);
      if (!parsed) continue;
      // Prefer in-memory hot copy when available because it preserves untruncated hops
      if (!merged.has(parsed.id)) {
        merged.set(parsed.id, parsed);
      }
    }
  }

  const sorted = Array.from(merged.values())
    .sort((a, b) => (b.receivedAt !== a.receivedAt ? b.receivedAt - a.receivedAt : a.id.localeCompare(b.id)))
    .slice(0, limit);

  return { traces: sorted, storageMode };
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