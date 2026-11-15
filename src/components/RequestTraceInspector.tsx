"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  GitBranch,
  Layers,
  SkipForward,
  Zap,
  Radio,
  Timer,
} from "lucide-react";
import type { HopOutcome, RequestModelStep, RequestTrace } from "@/lib/requestTraces";

export function formatFullTimestamp(epochMs: number): string {
  const date = new Date(epochMs);
  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${formatted}.${ms}`;
}

export function formatShortTime(epochMs: number): string {
  const date = new Date(epochMs);
  const formatted = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${formatted}.${ms}`;
}

export function formatRelativeAge(epochMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - epochMs) / 1000));
  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function getFallbackBadge(trace: RequestTrace) {
  if (trace.fallbackType === "model_fallback") {
    return {
      label: "Cascaded Fallback",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      icon: GitBranch,
    };
  }
  if (trace.fallbackType === "key_failover") {
    return {
      label: "Key Failover",
      className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      icon: Layers,
    };
  }
  if (trace.fallbackType === "failed") {
    return {
      label: "Request Failed",
      className: "bg-red-500/15 text-red-400 border-red-500/30",
      icon: XCircle,
    };
  }
  return {
    label: "Direct Hit",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: Zap,
  };
}

function getHopBadgeStyle(outcome: HopOutcome): { label: string; className: string; barColor: string } {
  switch (outcome) {
    case "success":
      return {
        label: "200 Settled",
        className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        barColor: "#10b981",
      };
    case "rate_limited":
      return {
        label: "429 Rate Limit",
        className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        barColor: "#f59e0b",
      };
    case "overloaded":
      return {
        label: "503 Overloaded",
        className: "bg-orange-500/15 text-orange-300 border-orange-500/30",
        barColor: "#f97316",
      };
    case "not_found":
      return {
        label: "404 Unavailable",
        className: "bg-red-500/15 text-red-300 border-red-500/30",
        barColor: "#ef4444",
      };
    case "dead_key":
      return {
        label: "Invalid Key",
        className: "bg-red-500/15 text-red-400 border-red-500/30",
        barColor: "#ef4444",
      };
    case "timeout":
      return {
        label: "Timeout",
        className: "bg-red-500/15 text-red-300 border-red-500/30",
        barColor: "#ef4444",
      };
    case "skipped":
      return {
        label: "Skipped",
        className: "bg-neutral-800/80 text-neutral-400 border-neutral-700",
        barColor: "#525252",
      };
    default:
      return {
        label: "Error",
        className: "bg-red-500/15 text-red-300 border-red-500/30",
        barColor: "#ef4444",
      };
  }
}

function getModelStepStyle(status: RequestModelStep["status"]) {
  switch (status) {
    case "settled":
      return {
        border: "border-emerald-500/40 bg-emerald-500/10",
        dot: "bg-emerald-400",
        tag: "text-emerald-300",
        label: "Settled",
      };
    case "exhausted":
      return {
        border: "border-amber-500/30 bg-amber-500/5",
        dot: "bg-amber-400",
        tag: "text-amber-300",
        label: "429 Exhausted",
      };
    case "overloaded":
      return {
        border: "border-orange-500/30 bg-orange-500/5",
        dot: "bg-orange-400",
        tag: "text-orange-300",
        label: "503 Overloaded",
      };
    case "skipped":
      return {
        border: "border-neutral-800 bg-[#0d0d0d] opacity-80",
        dot: "bg-neutral-500",
        tag: "text-neutral-400",
        label: "Skipped",
      };
    default:
      return {
        border: "border-red-500/30 bg-red-500/5",
        dot: "bg-red-400",
        tag: "text-red-300",
        label: status === "not_found" ? "404 Missing" : "Error",
      };
  }
}

/**
 * Compact spotlight widget rendered on the Dashboard Overview page.
 */
export function LatestRequestSnapshotCard({
  trace,
  nowMs,
}: {
  trace: RequestTrace | undefined;
  nowMs: number;
}) {
  if (!trace) {
    return (
      <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl h-full">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <GitBranch size={16} className="text-emerald-400" />
              Most Recent Request
            </h2>
            <Link
              href="/dashboard/requests"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
            >
              Request History <ArrowRight size={13} />
            </Link>
          </div>
          <div className="py-10 px-4 text-center border border-dashed border-neutral-800 rounded-xl">
            <Activity size={26} className="mx-auto text-neutral-600 mb-2" />
            <p className="text-xs font-medium text-neutral-300">No requests recorded yet</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-xs mx-auto">
              Send a Gemini API request through your Gateway Token to inspect routing chains,
              timing splits, and arrival timestamps here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const fbBadge = getFallbackBadge(trace);
  const FbIcon = fbBadge.icon;
  const attempts = trace.hops.filter((h) => h.type === "attempt");
  const total = Math.max(1, trace.totalDurationMs);
  const gwPct = Math.round((trace.phases.gatewayOverheadMs / total) * 100);
  const failPct = Math.round((trace.phases.upstreamFailedMs / total) * 100);
  const okPct = Math.max(0, 100 - gwPct - failPct);

  return (
    <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-xl min-w-0">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <GitBranch size={16} className="text-emerald-400" />
              Most Recent Request
            </h2>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase ${fbBadge.className}`}
            >
              <FbIcon size={10} />
              {fbBadge.label}
            </span>
          </div>

          <Link
            href="/dashboard/requests"
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
          >
            Full Trace <ArrowRight size={13} />
          </Link>
        </div>

        {/* Timestamp + HTTP Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400 mb-4 bg-[#0d0d0d] border border-neutral-800/80 rounded-xl px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock size={12} className="text-neutral-500 shrink-0" />
            <span className="font-[family-name:var(--font-mono)] text-neutral-200 truncate">
              {formatShortTime(trace.receivedAt)}
            </span>
            <span className="text-neutral-500 shrink-0">
              ({formatRelativeAge(trace.receivedAt, nowMs)})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 font-[family-name:var(--font-mono)]">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                trace.success
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              {trace.statusCode}
            </span>
            <span className="text-white font-semibold">{formatDurationMs(trace.totalDurationMs)}</span>
          </div>
        </div>

        {/* Requested -> Settled */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
          <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
              Requested Model
            </div>
            <div className="text-xs font-semibold text-white font-[family-name:var(--font-mono)] truncate">
              {trace.requestedModel}
            </div>
            {trace.resolvedModel !== trace.requestedModel && (
              <div className="text-[10px] text-cyan-400 font-[family-name:var(--font-mono)] mt-0.5 truncate">
                Alias → {trace.resolvedModel}
              </div>
            )}
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
              Final Settled Model
            </div>
            <div
              className={`text-xs font-semibold font-[family-name:var(--font-mono)] truncate ${
                trace.settledModel ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {trace.settledModel || "All models exhausted"}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5 truncate">
              {trace.settledKeyName ? `Key: ${trace.settledKeyName}` : `${attempts.length} attempt(s)`}
            </div>
          </div>
        </div>

        {/* Compact Traversed Model Chain */}
        {trace.modelsTraversed.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5">
              Model Chain Evaluated ({trace.modelsTraversed.length})
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {trace.modelsTraversed.slice(0, 6).map((step, i) => {
                const st = getModelStepStyle(step.status);
                return (
                  <React.Fragment key={`${step.model}_${i}`}>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-[family-name:var(--font-mono)] ${st.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      <span className="text-neutral-200 truncate max-w-[140px]">{step.model}</span>
                      <span className="text-[10px] text-neutral-500">{step.durationMs}ms</span>
                    </span>
                    {i < Math.min(trace.modelsTraversed.length, 6) - 1 && (
                      <ArrowRight size={11} className="text-neutral-600 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
              {trace.modelsTraversed.length > 6 && (
                <span className="text-[11px] text-neutral-500">
                  +{trace.modelsTraversed.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mini Time Distribution Strip */}
      <div className="pt-3 border-t border-neutral-800/70">
        <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden flex mb-2">
          {trace.phases.gatewayOverheadMs > 0 && (
            <div
              className="h-full bg-violet-500"
              style={{ width: `${Math.max(2, gwPct)}%` }}
              title={`Gateway overhead: ${trace.phases.gatewayOverheadMs} ms`}
            />
          )}
          {trace.phases.upstreamFailedMs > 0 && (
            <div
              className="h-full bg-amber-500"
              style={{ width: `${Math.max(2, failPct)}%` }}
              title={`Retries: ${trace.phases.upstreamFailedMs} ms`}
            />
          )}
          {trace.phases.upstreamSettledMs > 0 && (
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.max(2, okPct)}%` }}
              title={`Response time: ${trace.phases.upstreamSettledMs} ms`}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400 font-[family-name:var(--font-mono)]">
          <span>Gateway: {trace.phases.gatewayOverheadMs}ms</span>
          <span>Retries: {trace.phases.upstreamFailedMs}ms</span>
          <span className="text-emerald-400">Response: {trace.phases.upstreamSettledMs}ms</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-depth Request Trace Inspector used on /dashboard/requests.
 */
export function RequestTraceDetail({
  trace,
  nowMs,
  isLatest = false,
}: {
  trace: RequestTrace;
  nowMs: number;
  isLatest?: boolean;
}) {
  const [showSkippedHops, setShowSkippedHops] = useState(true);
  const [showFullChain, setShowFullChain] = useState(false);

  const fbBadge = getFallbackBadge(trace);
  const FbIcon = fbBadge.icon;

  const totalMs = Math.max(1, trace.totalDurationMs);
  const attemptHops = trace.hops.filter((h) => h.type === "attempt");
  const skippedHopsCount = trace.hops.length - attemptHops.length;
  const visibleHops = showSkippedHops ? trace.hops : attemptHops;

  const otherGatewayMs = Math.max(
    0,
    trace.phases.gatewayOverheadMs -
      trace.phases.authMs -
      trace.phases.poolFetchMs -
      trace.phases.discoveryMs
  );

  const gwPct = (trace.phases.gatewayOverheadMs / totalMs) * 100;
  const failPct = (trace.phases.upstreamFailedMs / totalMs) * 100;
  const okPct = (trace.phases.upstreamSettledMs / totalMs) * 100;

  const traversedSet = new Set(trace.modelsTraversed.map((s) => s.model));
  const remainingPlanned = trace.plannedChain.filter((m) => !traversedSet.has(m));

  let summarySentence = "";
  if (trace.isPassthrough) {
    summarySentence = trace.success
      ? `Direct API call served via ${trace.settledKeyName || "your key pool"} in ${formatDurationMs(trace.totalDurationMs)}.`
      : `Request failed with HTTP ${trace.statusCode}.`;
  } else if (trace.fallbackType === "direct") {
    summarySentence = `No fallback needed — served directly by ${trace.settledModel} via ${trace.settledKeyName} on the first attempt.`;
  } else if (trace.fallbackType === "key_failover") {
    summarySentence = `Same-model key failover — stayed on ${trace.settledModel} and succeeded on ${trace.settledKeyName} after ${attemptHops.length} attempts.`;
  } else if (trace.fallbackType === "model_fallback") {
    summarySentence = `Cascaded fallback triggered — requested ${trace.requestedModel}${
      trace.resolvedModel !== trace.requestedModel ? ` (resolved to ${trace.resolvedModel})` : ""
    }, stepped through ${trace.modelsTraversed.length} models, and settled on ${trace.settledModel} via ${trace.settledKeyName}.`;
  } else {
    summarySentence = `Request failed (${trace.statusCode}) after evaluating ${trace.modelsTraversed.length} model(s) and ${attemptHops.length} attempt(s).`;
  }

  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* 1. Arrival & Outcome Hero Card */}
      <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {isLatest && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-wider">
                <Radio size={11} />
                Most Recent
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                trace.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}
            >
              {trace.success ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              HTTP {trace.statusCode}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${fbBadge.className}`}
            >
              <FbIcon size={13} />
              {fbBadge.label}
            </span>
            {trace.isStreaming && (
              <span className="px-2 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[11px] font-semibold">
                Streaming
              </span>
            )}
          </div>

          <div className="text-right">
            <div className="text-lg sm:text-xl font-bold text-white font-[family-name:var(--font-mono)] tabular-nums">
              {formatDurationMs(trace.totalDurationMs)}
            </div>
            <div className="text-[11px] text-neutral-500">Total duration</div>
          </div>
        </div>

        {/* Exact Arrival Timestamp + Endpoint */}
        <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3.5 mb-4 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Clock size={13} className="text-emerald-400 shrink-0" />
              <span className="text-neutral-400">Arrived:</span>
              <span className="text-white font-semibold font-[family-name:var(--font-mono)]">
                {formatFullTimestamp(trace.receivedAt)}
              </span>
              <span className="text-emerald-400 font-medium">
                ({formatRelativeAge(trace.receivedAt, nowMs)})
              </span>
            </div>
            <span className="text-[11px] text-neutral-500 font-[family-name:var(--font-mono)]">
              UTC: {trace.receivedAtIso}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800/60">
            <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10px] font-bold text-cyan-300 font-[family-name:var(--font-mono)]">
              {trace.method}
            </span>
            <code className="text-neutral-300 font-[family-name:var(--font-mono)] break-all">
              /{trace.endpointPath}
            </code>
          </div>
        </div>

        {/* Plain-English Routing Summary */}
        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-4">
          {summarySentence}
        </p>

        {/* 4 Summary Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-xl p-3.5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
              Requested Model
            </div>
            <div className="text-sm font-semibold text-white font-[family-name:var(--font-mono)] break-all">
              {trace.requestedModel}
            </div>
            {trace.resolvedModel !== trace.requestedModel && (
              <div className="text-[11px] text-cyan-400 font-[family-name:var(--font-mono)] mt-1 break-all">
                Resolved → {trace.resolvedModel}
              </div>
            )}
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-xl p-3.5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
              Settled Model &amp; Key
            </div>
            <div
              className={`text-sm font-semibold font-[family-name:var(--font-mono)] break-all ${
                trace.settledModel ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {trace.settledModel || "None (Failed)"}
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              {trace.settledKeyName ? `Key: ${trace.settledKeyName}` : "No key succeeded"}
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-xl p-3.5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
              Fallback &amp; Attempts
            </div>
            <div className="text-sm font-semibold text-white">
              {trace.didFallback ? "Yes — Failover Active" : "No — Direct"}
            </div>
            <div className="text-[11px] text-neutral-400 mt-1 font-[family-name:var(--font-mono)]">
              {attemptHops.length} attempt(s) · {skippedHopsCount} skipped
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-xl p-3.5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
              Overall Time
            </div>
            <div className="text-sm font-semibold text-white font-[family-name:var(--font-mono)] tabular-nums">
              {trace.totalDurationMs.toLocaleString()} ms
            </div>
            <div className="text-[11px] text-neutral-400 mt-1 font-[family-name:var(--font-mono)]">
              {trace.isStreaming ? "Time to first byte" : "Full request"}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Timing Breakdown */}
      <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Timer size={15} className="text-cyan-400" />
              Where Time Was Spent
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Breakdown between gateway routing, retries, and the winning model response.
            </p>
          </div>
          <span className="text-xs font-[family-name:var(--font-mono)] text-white font-semibold">
            Total: {trace.totalDurationMs.toLocaleString()} ms
          </span>
        </div>

        {/* Stacked Proportional Bar */}
        <div className="h-4 w-full bg-neutral-900 rounded-xl overflow-hidden flex border border-neutral-800 mb-4">
          {trace.phases.gatewayOverheadMs > 0 && (
            <div
              className="h-full bg-violet-500"
              style={{ width: `${Math.max(1.5, gwPct)}%` }}
              title={`Gateway overhead: ${trace.phases.gatewayOverheadMs} ms`}
            />
          )}
          {trace.phases.upstreamFailedMs > 0 && (
            <div
              className="h-full bg-amber-500"
              style={{ width: `${Math.max(1.5, failPct)}%` }}
              title={`Retries: ${trace.phases.upstreamFailedMs} ms`}
            />
          )}
          {trace.phases.upstreamSettledMs > 0 && (
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.max(1.5, okPct)}%` }}
              title={`Settled model: ${trace.phases.upstreamSettledMs} ms`}
            />
          )}
        </div>

        {/* Detailed Phase Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              <span className="text-[11px]">Token Auth</span>
            </div>
            <div className="font-[family-name:var(--font-mono)] font-semibold text-white tabular-nums">
              {trace.phases.authMs} ms
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              <span className="text-[11px]">Key Lookup</span>
            </div>
            <div className="font-[family-name:var(--font-mono)] font-semibold text-white tabular-nums">
              {trace.phases.poolFetchMs} ms
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              <span className="text-[11px]">Model Sync</span>
            </div>
            <div className="font-[family-name:var(--font-mono)] font-semibold text-white tabular-nums">
              {trace.phases.discoveryMs} ms
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <span className="text-[11px]">Routing</span>
            </div>
            <div className="font-[family-name:var(--font-mono)] font-semibold text-white tabular-nums">
              {otherGatewayMs} ms
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-amber-300 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[11px]">Retries</span>
            </div>
            <div className="font-[family-name:var(--font-mono)] font-semibold text-amber-300 tabular-nums">
              {trace.phases.upstreamFailedMs} ms
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-emerald-300 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px]">
                {trace.isStreaming ? "First Byte" : "Settled Model"}
              </span>
            </div>
            <div className="font-[family-name:var(--font-mono)] font-semibold text-emerald-400 tabular-nums">
              {trace.phases.upstreamSettledMs} ms
            </div>
          </div>
        </div>
      </div>

      {/* 3. Complete Model Chain Visualization */}
      {!trace.isPassthrough && trace.modelsTraversed.length > 0 && (
        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <GitBranch size={15} className="text-emerald-400" />
                Complete Model Chain Evaluated
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Every model the router evaluated in order until the request settled.
              </p>
            </div>
            {remainingPlanned.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFullChain((v) => !v)}
                className="text-xs text-neutral-400 hover:text-white bg-[#0d0d0d] border border-neutral-800 px-3 py-1.5 rounded-lg transition-colors"
              >
                {showFullChain
                  ? "Hide standby models"
                  : `Show +${remainingPlanned.length} standby fallback models`}
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch gap-2">
            {trace.modelsTraversed.map((step, idx) => {
              const st = getModelStepStyle(step.status);
              return (
                <React.Fragment key={`${step.model}_${idx}`}>
                  <div
                    className={`rounded-xl border px-3.5 py-2.5 w-full sm:w-auto sm:min-w-[165px] max-w-full ${st.border}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        <span className={st.tag}>
                          #{idx + 1} · {st.label}
                        </span>
                      </span>
                      <span className="text-[11px] font-[family-name:var(--font-mono)] text-neutral-300 tabular-nums">
                        {step.durationMs}ms
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-white font-[family-name:var(--font-mono)] break-all">
                      {step.model}
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-1 truncate">
                      {step.attempts > 0
                        ? `${step.attempts} try · ${step.keysTried.join(", ")}`
                        : step.note || "Skipped"}
                    </div>
                  </div>
                  {idx < trace.modelsTraversed.length - 1 && (
                    <div className="flex items-center justify-center text-neutral-600 px-0.5">
                      <ArrowDown size={14} className="sm:hidden" />
                      <ArrowRight size={14} className="hidden sm:block" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {showFullChain && remainingPlanned.length > 0 && (
            <div className="mt-4 pt-3 border-t border-neutral-800/80 text-xs text-neutral-400">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
                Remaining Standby Chain (Not Needed)
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {remainingPlanned.map((m, idx) => (
                  <React.Fragment key={m}>
                    <span className="px-2 py-1 rounded-md bg-[#0d0d0d] border border-neutral-800 text-[11px] font-[family-name:var(--font-mono)] text-neutral-400">
                      {m}
                    </span>
                    {idx < remainingPlanned.length - 1 && (
                      <ArrowRight size={11} className="text-neutral-700" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Attempt-by-Attempt Waterfall Timeline */}
      <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity size={15} className="text-emerald-400" />
              Attempt-by-Attempt Waterfall Timeline
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Chronological trace of every attempt and skip from +0 ms to +{trace.totalDurationMs} ms.
            </p>
          </div>

          {skippedHopsCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSkippedHops((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                showSkippedHops
                  ? "bg-neutral-900 border-neutral-700 text-neutral-200"
                  : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              <SkipForward size={12} />
              {showSkippedHops ? `Showing ${skippedHopsCount} skips` : `Show ${skippedHopsCount} skips`}
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {visibleHops.map((hop) => {
            const style = getHopBadgeStyle(hop.outcome);
            const leftPct = Math.min(96, (hop.startOffsetMs / totalMs) * 100);
            const widthPct =
              hop.type === "skip"
                ? 1.5
                : Math.max(2.5, Math.min(100 - leftPct, (hop.durationMs / totalMs) * 100));

            return (
              <div
                key={hop.index}
                className={`p-3 rounded-xl border ${
                  hop.outcome === "success"
                    ? "bg-emerald-500/5 border-emerald-500/30"
                    : hop.type === "skip"
                      ? "bg-[#0c0c0c] border-neutral-800/60"
                      : "bg-[#0d0d0d] border-neutral-800"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-[11px] font-[family-name:var(--font-mono)] text-neutral-500 shrink-0">
                      #{hop.index}
                    </span>
                    <span className="text-xs font-semibold text-white font-[family-name:var(--font-mono)] truncate">
                      {hop.model}
                    </span>
                    {hop.keyName && (
                      <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-300 shrink-0">
                        {hop.keyName}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase shrink-0 ${style.className}`}
                    >
                      {style.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-[family-name:var(--font-mono)] tabular-nums shrink-0">
                    <span className="text-neutral-500">+{hop.startOffsetMs} ms</span>
                    <span className="text-white font-semibold">{hop.durationMs} ms</span>
                  </div>
                </div>

                {/* Waterfall Position Bar */}
                <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden relative mb-1.5">
                  <div
                    className="h-full rounded-full absolute top-0"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: style.barColor,
                    }}
                  />
                </div>

                <div className="text-[11px] text-neutral-400 break-words">{hop.reason}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}