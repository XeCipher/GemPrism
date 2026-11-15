"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  Search,
  Trash2,
  RefreshCw,
  Clock,
  Info,
  Copy,
  Check,
  ArrowRight,
  Activity,
} from "lucide-react";
import { useDashboard } from "@/components/DashboardContext";
import {
  formatDurationMs,
  formatRelativeAge,
  formatShortTime,
  RequestTraceDetail,
} from "@/components/RequestTraceInspector";

type TraceFilter = "all" | "fallbacks" | "errors";

const OPTIONAL_REQUEST_LOGS_SQL = `create table if not exists request_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  created_at   timestamptz default now(),
  received_at  bigint not null,
  trace_data   jsonb not null
);

create index if not exists idx_request_logs_user_time
  on request_logs (user_id, received_at desc);`;

export default function RequestsInspectorPage() {
  const { data, nowMs, refreshing, refreshStats, clearTraces, handleCopy, copiedId } =
    useDashboard();

  const [selectedTraceId, setSelectedTraceId] = useState<string>("");
  const [filterMode, setFilterMode] = useState<TraceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [showStorageInfo, setShowStorageInfo] = useState(false);

  const traces = data?.traces || [];

  const filteredTraces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return traces.filter((t) => {
      if (filterMode === "fallbacks" && !t.didFallback) return false;
      if (filterMode === "errors" && t.success) return false;

      if (q) {
        const hay = `${t.requestedModel} ${t.resolvedModel} ${t.settledModel || ""} ${
          t.settledKeyName || ""
        } ${t.endpointPath}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [traces, filterMode, searchQuery]);

  const activeTrace = useMemo(() => {
    if (selectedTraceId) {
      const matched = filteredTraces.find((t) => t.id === selectedTraceId);
      if (matched) return matched;
    }
    return filteredTraces[0] || traces[0] || null;
  }, [filteredTraces, traces, selectedTraceId]);

  if (!data) return null;

  const handleClearClick = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setConfirmClear(false);
    setSelectedTraceId("");
    await clearTraces();
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-white flex items-center gap-2">
            <GitBranch size={19} className="text-emerald-400" />
            Request Tracer &amp; Failover Inspector
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Track requested vs settled models, complete failover chains, arrival timestamps, and exact per-phase latency.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.traceStorageMode === "compat" && (
            <button
              type="button"
              onClick={() => setShowStorageInfo((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white transition-colors"
            >
              <Info size={13} className="text-cyan-400" />
              <span>Compact Storage</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void refreshStats(false, false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-emerald-400" : ""} />
            <span>Refresh</span>
          </button>

          {traces.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearClick()}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-colors ${
                confirmClear
                  ? "bg-red-500/15 border-red-500/35 text-red-400"
                  : "bg-[#0a0a0a] border-neutral-800 hover:border-red-500/30 text-neutral-400 hover:text-red-400"
              }`}
            >
              <Trash2 size={13} />
              <span>{confirmClear ? "Confirm Clear" : "Clear History"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Optional SQL Upgrade Notice (only shown when toggled) */}
      {showStorageInfo && (
        <div className="bg-[#0a0a0a] border border-cyan-500/25 rounded-2xl p-4 text-xs space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-white mb-1">
                Optional: Enable Long-Term Trace Persistence in Supabase
              </div>
              <p className="text-neutral-400 leading-relaxed">
                Right now GemPrism is automatically storing your latest 15 requests in built-in compact
                compatibility storage (and up to 40 full traces in active memory). To store longer untruncated
                history across cold starts, run this optional SQL in your Supabase SQL editor:
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(OPTIONAL_REQUEST_LOGS_SQL)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white shrink-0"
            >
              {copiedId === OPTIONAL_REQUEST_LOGS_SQL ? (
                <Check size={12} className="text-emerald-400" />
              ) : (
                <Copy size={12} />
              )}
              Copy SQL
            </button>
          </div>
          <pre className="bg-[#060606] border border-neutral-800 rounded-xl p-3 overflow-x-auto text-[11px] text-cyan-300 font-[family-name:var(--font-mono)]">
            {OPTIONAL_REQUEST_LOGS_SQL}
          </pre>
        </div>
      )}

      {/* Empty State */}
      {traces.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-10 text-center shadow-xl">
          <Activity size={36} className="mx-auto text-neutral-600 mb-3" />
          <h2 className="text-base font-semibold text-white mb-1.5">
            No proxied requests recorded yet
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto mb-5 leading-relaxed">
            Every request routed through <code className="text-emerald-400">/api/proxy</code> is
            automatically traced with exact arrival timestamp, failover chain, and phase-by-phase timings.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition-colors"
          >
            View Gateway Token &amp; SDK Setup <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile Quick Switcher (keeps Most Recent Request Detail immediately visible at top on phones) */}
          <div className="lg:hidden bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-300">
                Select Trace ({filteredTraces.length})
              </span>
              <div className="flex gap-1">
                {(["all", "fallbacks", "errors"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize border transition-colors ${
                      filterMode === mode
                        ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                        : "bg-[#0d0d0d] border-neutral-800 text-neutral-400"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {filteredTraces.map((t, idx) => {
                const isSelected = activeTrace?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTraceId(t.id)}
                    className={`shrink-0 text-left px-3 py-2 rounded-xl border transition-colors min-w-[170px] ${
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/40"
                        : "bg-[#0d0d0d] border-neutral-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] mb-1">
                      <span
                        className={`font-bold ${
                          !t.success
                            ? "text-red-400"
                            : t.didFallback
                              ? "text-amber-300"
                              : "text-emerald-400"
                        }`}
                      >
                        {idx === 0 && filterMode === "all" ? "LATEST · " : ""}
                        {t.statusCode}
                      </span>
                      <span className="text-neutral-500 font-[family-name:var(--font-mono)]">
                        {formatDurationMs(t.totalDurationMs)}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-white font-[family-name:var(--font-mono)] truncate max-w-[160px]">
                      {t.settledModel || t.requestedModel}
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">
                      {formatShortTime(t.receivedAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop Split View + Mobile Selected Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Desktop Left History Feed */}
            <aside className="hidden lg:flex lg:col-span-4 flex-col bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-4 shadow-xl lg:sticky lg:top-5 max-h-[calc(100vh-3rem)]">
              <div className="space-y-3 mb-3">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by model or key…"
                    className="w-full bg-[#0d0d0d] border border-neutral-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-neutral-600 outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "all", label: `All (${traces.length})` },
                      {
                        id: "fallbacks",
                        label: `Fallbacks (${traces.filter((t) => t.didFallback).length})`,
                      },
                      {
                        id: "errors",
                        label: `Errors (${traces.filter((t) => !t.success).length})`,
                      },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setFilterMode(pill.id)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors truncate ${
                        filterMode === pill.id
                          ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                          : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 overflow-y-auto pr-1 flex-1">
                {filteredTraces.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    No matching requests.
                  </div>
                ) : (
                  filteredTraces.map((t) => {
                    const isSelected = activeTrace?.id === t.id;
                    const isNewest = t.id === traces[0]?.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTraceId(t.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-colors ${
                          isSelected
                            ? "bg-emerald-500/10 border-emerald-500/40"
                            : "bg-[#0d0d0d] border-neutral-800/80 hover:border-neutral-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                !t.success
                                  ? "bg-red-500"
                                  : t.fallbackType === "model_fallback"
                                    ? "bg-amber-400"
                                    : t.fallbackType === "key_failover"
                                      ? "bg-cyan-400"
                                      : "bg-emerald-500"
                              }`}
                            />
                            {isNewest && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500 text-black">
                                Latest
                              </span>
                            )}
                            <span className="text-[11px] font-[family-name:var(--font-mono)] text-neutral-300 font-semibold">
                              {t.statusCode}
                            </span>
                            {t.fallbackType === "model_fallback" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                                Fallback
                              </span>
                            )}
                            {t.fallbackType === "key_failover" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                                Key Switch
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-[family-name:var(--font-mono)] text-white font-semibold tabular-nums shrink-0">
                            {formatDurationMs(t.totalDurationMs)}
                          </span>
                        </div>

                        <div className="text-xs font-medium text-white font-[family-name:var(--font-mono)] truncate">
                          {t.requestedModel}
                        </div>
                        {t.settledModel && t.settledModel !== t.requestedModel && (
                          <div className="text-[11px] text-emerald-400 font-[family-name:var(--font-mono)] truncate mt-0.5">
                            → {t.settledModel}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 text-[10px] text-neutral-500 mt-2">
                          <span className="flex items-center gap-1 font-[family-name:var(--font-mono)]">
                            <Clock size={10} />
                            {formatShortTime(t.receivedAt)}
                          </span>
                          <span>{formatRelativeAge(t.receivedAt, nowMs)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Right Deep Trace Inspector */}
            <div className="lg:col-span-8 min-w-0">
              {activeTrace ? (
                <RequestTraceDetail
                  trace={activeTrace}
                  nowMs={nowMs}
                  isLatest={activeTrace.id === traces[0]?.id}
                />
              ) : (
                <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-10 text-center text-xs text-neutral-500">
                  No requests match your current filter.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}