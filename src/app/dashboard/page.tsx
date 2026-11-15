"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ShieldAlert,
  Zap,
  ServerCrash,
  Copy,
  Check,
  Code as CodeIcon,
  ChevronDown,
  CheckCircle2,
  TrendingUp,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { useDashboard } from "@/components/DashboardContext";
import { LiveRpmPulseCard } from "@/components/AnalyticsCharts";
import { LatestRequestSnapshotCard } from "@/components/RequestTraceInspector";

export default function DashboardOverviewPage() {
  const { data, nowMs, rpmHistory, copiedId, handleCopy } = useDashboard();
  const [showIntegration, setShowIntegration] = useState(false);

  if (!data) return null;

  const proxyBaseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/proxy`
      : "https://gemprism.vercel.app/api/proxy";

  const integrationCode = `import { GoogleGenAI } from "@google/genai";

// ① Use your GemPrism Gateway Token as the API key
// ② Point baseUrl at your GemPrism instance
const ai = new GoogleGenAI({
  apiKey: "${data.token}",
  baseUrl: "${proxyBaseUrl}",
});

// Automatic load balancing, live model discovery, & cross-model failover
const response = await ai.models.generateContent({
  model: "gemini-flash-latest",
  contents: "Explain quantum entanglement in one sentence.",
});

console.log(response.text);`;

  const reliabilityPct =
    data.summary.total_requests > 0
      ? Math.max(
          0,
          Math.round(
            ((data.summary.total_requests - data.summary.total_errors) /
              data.summary.total_requests) *
              1000
          ) / 10
        )
      : 100;

  const isBrandNewUser = data.keys.length === 0;
  const integrationVisible = showIntegration || isBrandNewUser;
  const latestTrace = data.traces[0];
  const savedTracesCount = data.tracesTotal ?? data.traces.length;

  return (
    <div className="space-y-6">
      {/* ── Gateway Endpoint & Token Bar ── */}
      <div className="bg-[#0a0a0a] border border-emerald-500/20 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Gateway Endpoint &amp; Token
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Drop-in replacement for Google GenAI SDK — automatic failover across keys and models.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy(data.token)}
              className="flex items-center gap-2 bg-[#0f0f0f] border border-neutral-800 hover:border-emerald-500/40 px-3 py-2 rounded-xl text-xs transition-colors group max-w-full"
            >
              <span className="text-neutral-500 font-medium shrink-0">Token:</span>
              <code className="text-emerald-300 font-[family-name:var(--font-mono)] truncate max-w-[165px] sm:max-w-[220px]">
                {data.token}
              </code>
              {copiedId === data.token ? (
                <Check size={14} className="text-emerald-400 shrink-0" />
              ) : (
                <Copy size={14} className="text-neutral-500 group-hover:text-white shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleCopy(proxyBaseUrl)}
              className="flex items-center gap-2 bg-[#0f0f0f] border border-neutral-800 hover:border-cyan-500/40 px-3 py-2 rounded-xl text-xs transition-colors group"
            >
              <span className="text-neutral-500 font-medium">Base URL</span>
              {copiedId === proxyBaseUrl ? (
                <Check size={14} className="text-cyan-400 shrink-0" />
              ) : (
                <Copy size={14} className="text-neutral-500 group-hover:text-white shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowIntegration((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                integrationVisible
                  ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                  : "bg-[#0f0f0f] border-neutral-800 text-neutral-300 hover:text-white"
              }`}
            >
              <CodeIcon size={14} />
              <span>SDK Setup</span>
              <ChevronDown
                size={13}
                className={`transition-transform duration-200 ${integrationVisible ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        </div>

        {integrationVisible && (
          <div className="mt-4 pt-4 border-t border-neutral-800/80">
            <CodeBlock code={integrationCode} />
          </div>
        )}
      </div>

      {/* ── KPI Summary Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-[11px] font-semibold uppercase tracking-wider">
              Requests Today
            </span>
            <Activity size={15} className="text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold text-white font-[family-name:var(--font-mono)] tabular-nums">
              {data.summary.today_requests.toLocaleString()}
            </span>
            <span className="text-[11px] font-[family-name:var(--font-mono)] text-cyan-400 font-semibold">
              {data.summary.active_rpm} rpm
            </span>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-[11px] font-semibold uppercase tracking-wider">
              All-Time Total
            </span>
            <TrendingUp size={15} className="text-cyan-400" />
          </div>
          <div className="text-2xl font-semibold text-white font-[family-name:var(--font-mono)] tabular-nums">
            {data.summary.total_requests.toLocaleString()}
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-[11px] font-semibold uppercase tracking-wider">
              Healthy Keys
            </span>
            <Zap size={15} className="text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-white font-[family-name:var(--font-mono)] tabular-nums">
              {data.summary.active}
            </span>
            <span className="text-xs text-neutral-500">/ {data.keys.length} total</span>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-[11px] font-semibold uppercase tracking-wider">
              Model Cooldowns
            </span>
            <ShieldAlert size={15} className="text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold text-white font-[family-name:var(--font-mono)] tabular-nums">
              {data.cooldowns.length}
            </span>
            {data.summary.dead > 0 ? (
              <span className="text-[11px] text-red-400 font-medium flex items-center gap-1">
                <ServerCrash size={12} /> {data.summary.dead} dead
              </span>
            ) : (
              <span className="text-[11px] text-emerald-400/80 font-medium">0 dead</span>
            )}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-[#0a0a0a] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between gap-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-[11px] font-semibold uppercase tracking-wider">
              Success Rate
            </span>
            <CheckCircle2 size={15} className="text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold text-white font-[family-name:var(--font-mono)] tabular-nums">
              {reliabilityPct}%
            </span>
            <span className="text-[11px] text-neutral-500">{data.summary.total_errors} err</span>
          </div>
        </div>
      </div>

      {/* ── Primary Executive Grid: Latest Request Snapshot + Pool Health & RPM ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 min-w-0">
          <LatestRequestSnapshotCard trace={latestTrace} nowMs={nowMs} />
        </div>

        <div className="lg:col-span-5 bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between gap-5 shadow-xl min-w-0">
          <LiveRpmPulseCard rpmHistory={rpmHistory} />

          <div className="pt-4 border-t border-neutral-800/80">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <KeyRound size={15} className="text-emerald-400" />
                Key Pool Status
              </h3>
              <Link
                href="/dashboard/keys"
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
              >
                Manage Keys <ArrowRight size={13} />
              </Link>
            </div>

            {data.keys.length === 0 ? (
              <div className="bg-[#0d0d0d] border border-dashed border-neutral-800 rounded-xl p-4 text-center">
                <p className="text-xs text-neutral-400 mb-2">No Gemini API keys configured yet.</p>
                <Link
                  href="/dashboard/keys"
                  className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3.5 py-2 rounded-lg transition-colors"
                >
                  Add Your First Key <ArrowRight size={13} />
                </Link>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {data.keys.map((k) => {
                  const coolingCount = k.cooling_models?.length || 0;
                  const todayForKey = data.usage
                    .filter((u) => u.api_key_id === k.id)
                    .reduce((sum, u) => sum + u.rpd_count, 0);

                  return (
                    <div
                      key={k.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#0d0d0d] border border-neutral-800/80 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            k.status === "dead"
                              ? "bg-red-500"
                              : coolingCount > 0
                                ? "bg-amber-400"
                                : "bg-emerald-500"
                          }`}
                        />
                        <span className="font-medium text-white truncate">{k.name}</span>
                        {coolingCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
                            {coolingCount} cooling
                          </span>
                        )}
                      </div>
                      <span className="font-[family-name:var(--font-mono)] text-neutral-400 shrink-0 tabular-nums">
                        <strong className="text-emerald-400">{todayForKey}</strong> today
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Deep-Dive Links ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/dashboard/requests"
          className="bg-[#0a0a0a] hover:bg-[#0e0e0e] border border-neutral-800 hover:border-emerald-500/35 rounded-2xl p-4 transition-colors flex items-center justify-between gap-3"
        >
          <div>
            <div className="text-sm font-semibold text-white">Request Inspector</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              Waterfall timings &amp; fallback chains ({savedTracesCount.toLocaleString()} saved)
            </div>
          </div>
          <ArrowRight size={16} className="text-emerald-400 shrink-0" />
        </Link>

        <Link
          href="/dashboard/analytics"
          className="bg-[#0a0a0a] hover:bg-[#0e0e0e] border border-neutral-800 hover:border-cyan-500/35 rounded-2xl p-4 transition-colors flex items-center justify-between gap-3"
        >
          <div>
            <div className="text-sm font-semibold text-white">Distribution Charts</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              Key × model heatmap, share donut &amp; RPM
            </div>
          </div>
          <ArrowRight size={16} className="text-cyan-400 shrink-0" />
        </Link>

        <Link
          href="/dashboard/models"
          className="bg-[#0a0a0a] hover:bg-[#0e0e0e] border border-neutral-800 hover:border-violet-500/35 rounded-2xl p-4 transition-colors flex items-center justify-between gap-3"
        >
          <div>
            <div className="text-sm font-semibold text-white">Model Catalog</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              Explore {data.models.length} discovered models &amp; failovers
            </div>
          </div>
          <ArrowRight size={16} className="text-violet-400 shrink-0" />
        </Link>
      </div>
    </div>
  );
}