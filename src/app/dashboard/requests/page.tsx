"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  Search,
  Trash2,
  RefreshCw,
  Clock,
  ArrowRight,
  Activity,
  ChevronDown,
} from "lucide-react";
import { useDashboard } from "@/components/DashboardContext";
import {
  formatDurationMs,
  formatRelativeAge,
  formatShortTime,
  RequestTraceDetail,
} from "@/components/RequestTraceInspector";
import type { RequestTrace, RequestTraceFilter } from "@/lib/requestTraces";

function matchesLocalFilter(
  trace: RequestTrace,
  filterMode: RequestTraceFilter,
  queryLower: string
): boolean {
  if (filterMode === "fallbacks" && !trace.didFallback) return false;
  if (filterMode === "errors" && trace.success) return false;

  if (queryLower) {
    const haystack = `${trace.requestedModel} ${trace.resolvedModel} ${
      trace.settledModel || ""
    } ${trace.settledKeyName || ""} ${trace.endpointPath}`.toLowerCase();
    if (!haystack.includes(queryLower)) return false;
  }

  return true;
}

function mergeTracesDescending(...lists: RequestTrace[][]): RequestTrace[] {
  const byId = new Map<string, RequestTrace>();
  for (const list of lists) {
    for (const item of list) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    b.receivedAt !== a.receivedAt ? b.receivedAt - a.receivedAt : a.id.localeCompare(b.id)
  );
}

export default function RequestsInspectorPage() {
  const { data, session, nowMs, refreshing, refreshStats, clearTraces, addToast } =
    useDashboard();

  const [selectedTraceId, setSelectedTraceId] = useState<string>("");
  const [filterMode, setFilterMode] = useState<RequestTraceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // Pagination state for browsing older saved history without losing items on live polls
  const [olderTraces, setOlderTraces] = useState<RequestTrace[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Server-backed query state when filtering/searching across larger saved histories
  const [serverMatches, setServerMatches] = useState<RequestTrace[] | null>(null);
  const [serverMatchesTotal, setServerMatchesTotal] = useState(0);
  const [serverMatchesHasMore, setServerMatchesHasMore] = useState(false);
  const [searchingServer, setSearchingServer] = useState(false);

  const headTraces = useMemo(() => data?.traces || [], [data?.traces]);
  const totalSavedCount = data?.tracesTotal ?? headTraces.length;

  const allLoadedTraces = useMemo(
    () => mergeTracesDescending(headTraces, olderTraces),
    [headTraces, olderTraces]
  );

  const defaultHasMore = useMemo(() => {
    if (olderHasMore !== null) return olderHasMore;
    return Boolean(data?.tracesHasMore && allLoadedTraces.length < totalSavedCount);
  }, [olderHasMore, data?.tracesHasMore, allLoadedTraces.length, totalSavedCount]);

  const isFilteredOrSearched = filterMode !== "all" || searchQuery.trim().length > 0;
  const hasUnloadedHistory = defaultHasMore || allLoadedTraces.length < totalSavedCount;
  const shouldQueryServer = isFilteredOrSearched && hasUnloadedHistory;

  // Fetch matching traces from full saved history when filtering/searching beyond loaded head
  useEffect(() => {
    if (!session || !shouldQueryServer) return;

    const controller = new AbortController();
    const trimmed = searchQuery.trim();
    const delayMs = trimmed ? 250 : 0;

    const timer = setTimeout(async () => {
      setSearchingServer(true);
      try {
        const params = new URLSearchParams({
          limit: "50",
          offset: "0",
          filter: filterMode,
          q: trimmed,
        });
        const res = await fetch(`/api/admin/traces?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
        if (res.ok) {
          const json = (await res.json()) as {
            traces: RequestTrace[];
            total: number;
            hasMore: boolean;
          };
          setServerMatches(json.traces);
          setServerMatchesTotal(json.total);
          setServerMatchesHasMore(json.hasMore);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Retain local matches silently if a transient network error occurs
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchingServer(false);
        }
      }
    }, delayMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [session, shouldQueryServer, filterMode, searchQuery]);

  const displayedTraces = useMemo(() => {
    const queryLower = searchQuery.trim().toLowerCase();
    const localFiltered = allLoadedTraces.filter((t) =>
      matchesLocalFilter(t, filterMode, queryLower)
    );

    if (!isFilteredOrSearched) {
      return allLoadedTraces;
    }

    if (shouldQueryServer && serverMatches !== null) {
      const liveHeadMatches = headTraces.filter((t) =>
        matchesLocalFilter(t, filterMode, queryLower)
      );
      return mergeTracesDescending(liveHeadMatches, serverMatches);
    }

    return localFiltered;
  }, [
    allLoadedTraces,
    headTraces,
    filterMode,
    searchQuery,
    isFilteredOrSearched,
    shouldQueryServer,
    serverMatches,
  ]);

  const canLoadMore = shouldQueryServer && serverMatches !== null ? serverMatchesHasMore : !isFilteredOrSearched && defaultHasMore;

  const activeTrace = useMemo(() => {
    if (selectedTraceId) {
      const matched = displayedTraces.find((t) => t.id === selectedTraceId);
      if (matched) return matched;
    }
    return displayedTraces[0] || headTraces[0] || null;
  }, [displayedTraces, headTraces, selectedTraceId]);

  if (!data) return null;

  const handleFilterChange = (nextFilter: RequestTraceFilter) => {
    setFilterMode(nextFilter);
    setServerMatches(null);
    setServerMatchesHasMore(false);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setServerMatches(null);
    setServerMatchesHasMore(false);
  };

  const handleLoadOlder = async () => {
    if (!session || loadingOlder) return;
    setLoadingOlder(true);

    try {
      if (shouldQueryServer && serverMatches !== null) {
        const params = new URLSearchParams({
          limit: "50",
          offset: String(serverMatches.length),
          filter: filterMode,
          q: searchQuery.trim(),
        });
        const res = await fetch(`/api/admin/traces?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = (await res.json()) as {
            traces: RequestTrace[];
            total: number;
            hasMore: boolean;
          };
          setServerMatches((prev) => mergeTracesDescending(prev || [], json.traces));
          setServerMatchesTotal(json.total);
          setServerMatchesHasMore(json.hasMore);
        } else {
          addToast("Failed to load more matching requests", "error");
        }
      } else {
        const params = new URLSearchParams({
          limit: "50",
          offset: String(allLoadedTraces.length),
          filter: "all",
        });
        const res = await fetch(`/api/admin/traces?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = (await res.json()) as {
            traces: RequestTrace[];
            total: number;
            hasMore: boolean;
          };
          setOlderTraces((prev) => mergeTracesDescending(prev, json.traces));
          setOlderHasMore(json.hasMore);
        } else {
          addToast("Failed to load older requests", "error");
        }
      }
    } catch {
      addToast("Failed to load older requests", "error");
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleClearClick = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setConfirmClear(false);
    setSelectedTraceId("");
    setOlderTraces([]);
    setOlderHasMore(null);
    setServerMatches(null);
    setServerMatchesHasMore(false);
    await clearTraces();
  };

  const handleRefreshClick = async () => {
    await refreshStats(false, false);
    if (shouldQueryServer && session) {
      setSearchingServer(true);
      try {
        const params = new URLSearchParams({
          limit: "50",
          offset: "0",
          filter: filterMode,
          q: searchQuery.trim(),
        });
        const res = await fetch(`/api/admin/traces?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = (await res.json()) as {
            traces: RequestTrace[];
            total: number;
            hasMore: boolean;
          };
          setServerMatches(json.traces);
          setServerMatchesTotal(json.total);
          setServerMatchesHasMore(json.hasMore);
        }
      } finally {
        setSearchingServer(false);
      }
    }
  };

  const remainingToLoad = shouldQueryServer && serverMatches !== null
    ? Math.max(0, serverMatchesTotal - serverMatches.length)
    : Math.max(0, totalSavedCount - allLoadedTraces.length);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-white flex flex-wrap items-center gap-2">
            <GitBranch size={19} className="text-emerald-400" />
            <span>Request Tracer &amp; Failover Inspector</span>
            {totalSavedCount > 0 && (
              <span className="text-neutral-400 font-normal text-xs bg-neutral-900 border border-neutral-800 px-2.5 py-0.5 rounded-full font-[family-name:var(--font-mono)]">
                {totalSavedCount.toLocaleString()} saved
              </span>
            )}
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Track requested vs settled models, complete failover chains, arrival timestamps, and exact per-phase latency.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefreshClick()}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-emerald-400" : ""} />
            <span>Refresh</span>
          </button>

          {totalSavedCount > 0 && (
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

      {/* Empty State */}
      {totalSavedCount === 0 && headTraces.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-10 text-center shadow-xl">
          <Activity size={36} className="mx-auto text-neutral-600 mb-3" />
          <h2 className="text-base font-semibold text-white mb-1.5">
            No requests recorded yet
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto mb-5 leading-relaxed">
            Every request routed through your GemPrism Gateway is automatically saved with its exact
            arrival timestamp, failover chain, and timing breakdown.
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
          {/* Mobile Quick Switcher & Search */}
          <div className="lg:hidden bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-3 space-y-2.5">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search model, key, or path…"
                className="w-full bg-[#0d0d0d] border border-neutral-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-neutral-600 outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-300">
                {searchingServer
                  ? "Searching…"
                  : `Showing ${displayedTraces.length}${
                      isFilteredOrSearched && shouldQueryServer && serverMatches !== null
                        ? ` of ${serverMatchesTotal}`
                        : !isFilteredOrSearched
                          ? ` of ${totalSavedCount}`
                          : ""
                    }`}
              </span>
              <div className="flex gap-1">
                {(["all", "fallbacks", "errors"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleFilterChange(mode)}
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
              {displayedTraces.map((t) => {
                const isSelected = activeTrace?.id === t.id;
                const isNewest = t.id === headTraces[0]?.id;
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
                        {isNewest ? "LATEST · " : ""}
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

              {canLoadMore && (
                <button
                  type="button"
                  onClick={() => void handleLoadOlder()}
                  disabled={loadingOlder}
                  className="shrink-0 px-4 py-2 rounded-xl border border-neutral-800 bg-[#0d0d0d] hover:border-emerald-500/40 text-xs font-semibold text-emerald-400 flex flex-col items-center justify-center gap-1 min-w-[130px] disabled:opacity-50"
                >
                  <ChevronDown size={14} className={loadingOlder ? "animate-bounce" : ""} />
                  <span>{loadingOlder ? "Loading…" : "Load older"}</span>
                  {remainingToLoad > 0 && (
                    <span className="text-[10px] text-neutral-500 font-normal">
                      {remainingToLoad.toLocaleString()} left
                    </span>
                  )}
                </button>
              )}
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
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Filter by model, key, or path…"
                    className="w-full bg-[#0d0d0d] border border-neutral-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-neutral-600 outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "all", label: `All (${totalSavedCount.toLocaleString()})` },
                      { id: "fallbacks", label: "Fallbacks" },
                      { id: "errors", label: "Errors" },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => handleFilterChange(pill.id)}
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
                {searchingServer && displayedTraces.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    Searching request history…
                  </div>
                ) : displayedTraces.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    No matching requests.
                  </div>
                ) : (
                  <>
                    {displayedTraces.map((t) => {
                      const isSelected = activeTrace?.id === t.id;
                      const isNewest = t.id === headTraces[0]?.id;
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
                    })}

                    {canLoadMore && (
                      <button
                        type="button"
                        onClick={() => void handleLoadOlder()}
                        disabled={loadingOlder}
                        className="w-full py-2.5 px-3 rounded-xl border border-neutral-800 hover:border-emerald-500/35 bg-[#0d0d0d] text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <ChevronDown size={14} className={loadingOlder ? "animate-bounce" : ""} />
                        <span>
                          {loadingOlder
                            ? "Loading older requests…"
                            : remainingToLoad > 0
                              ? `Load older (${remainingToLoad.toLocaleString()} more)`
                              : "Load older requests"}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </aside>

            {/* Right Deep Trace Inspector */}
            <div className="lg:col-span-8 min-w-0">
              {activeTrace ? (
                <RequestTraceDetail
                  trace={activeTrace}
                  nowMs={nowMs}
                  isLatest={activeTrace.id === headTraces[0]?.id}
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