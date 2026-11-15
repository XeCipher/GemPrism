"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart3,
  PieChart,
  Grid3X3,
  Activity,
  Flame,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { ModelCatalogItem, ModelCategory } from "@/lib/geminiModels";
import { CATEGORY_INFO } from "@/lib/geminiModels";

export interface DashboardKeyItem {
  id: string;
  name: string;
  key_value: string;
  status: string;
  total_requests: number;
  total_errors: number;
  last_error?: string | null;
  last_used?: number | null;
  cooling_models?: Array<{
    api_key_id: string;
    model_name: string;
    until: number;
    reason: "daily" | "minute";
    status_code: number;
  }>;
}

export interface DashboardUsageItem {
  api_key_id: string;
  model_name: string;
  rpd_count: number;
  rpm_count: number;
}

export interface DashboardCooldownItem {
  api_key_id: string;
  model_name: string;
  until: number;
  reason: "daily" | "minute";
  status_code?: number;
}

interface AnalyticsChartsProps {
  keys: DashboardKeyItem[];
  models: ModelCatalogItem[];
  usage: DashboardUsageItem[];
  cooldowns: DashboardCooldownItem[];
  rpmHistory: Array<{ time: string; rpm: number; rpd: number }>;
  selectedKeyId: string;
  onSelectKey: (keyId: string) => void;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

type MetricMode = "rpd" | "rpm";

const MODEL_PALETTE = [
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ec4899", // pink
  "#14b8a6", // teal
  "#84cc16", // lime
  "#f97316", // orange
  "#a855f7", // purple
];

export function LiveRpmPulseCard({
  rpmHistory,
}: {
  rpmHistory: Array<{ time: string; rpm: number; rpd: number }>;
}) {
  const sparkline = useMemo(() => {
    const points = rpmHistory.length > 0 ? rpmHistory : [{ time: "Now", rpm: 0, rpd: 0 }];
    const maxRpm = Math.max(4, ...points.map((p) => p.rpm));
    const width = 320;
    const height = 92;

    const coords = points.map((p, idx) => {
      const x = points.length === 1 ? width / 2 : (idx / (points.length - 1)) * width;
      const y = height - 10 - (p.rpm / maxRpm) * (height - 22);
      return { x, y, ...p };
    });

    const linePath = coords
      .map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");
    const areaPath =
      coords.length > 0
        ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`
        : "";

    return { coords, linePath, areaPath, width, height };
  }, [rpmHistory]);

  const currentRpm = rpmHistory[rpmHistory.length - 1]?.rpm || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Activity size={15} className="text-cyan-400" />
          Live RPM Pulse
        </h3>
        <span className="text-xs font-[family-name:var(--font-mono)] text-cyan-400 font-semibold tabular-nums">
          {currentRpm.toLocaleString()} req/min
        </span>
      </div>
      <p className="text-xs text-neutral-500 mb-3">
        Rolling throughput captured across live 6s telemetry polls.
      </p>

      <div className="bg-[#0d0d0d] border border-neutral-800/80 rounded-xl p-3">
        <svg
          viewBox={`0 0 ${sparkline.width} ${sparkline.height}`}
          className="w-full h-24 overflow-visible"
        >
          <defs>
            <linearGradient id="rpmPulseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line
            x1="0"
            y1={sparkline.height - 10}
            x2={sparkline.width}
            y2={sparkline.height - 10}
            stroke="#262626"
            strokeDasharray="3 3"
          />
          <line
            x1="0"
            y1={sparkline.height / 2}
            x2={sparkline.width}
            y2={sparkline.height / 2}
            stroke="#1f1f1f"
            strokeDasharray="3 3"
          />
          {sparkline.areaPath && <path d={sparkline.areaPath} fill="url(#rpmPulseGrad)" />}
          {sparkline.linePath && (
            <path
              d={sparkline.linePath}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {sparkline.coords.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={i === sparkline.coords.length - 1 ? 3.5 : 2}
              fill={i === sparkline.coords.length - 1 ? "#22d3ee" : "#0891b2"}
            />
          ))}
        </svg>
        <div className="flex justify-between text-[10px] text-neutral-600 font-[family-name:var(--font-mono)] mt-1">
          <span>{rpmHistory[0]?.time || "Now"}</span>
          <span>Peak: {Math.max(0, ...rpmHistory.map((r) => r.rpm))} rpm</span>
          <span>{rpmHistory[rpmHistory.length - 1]?.time || "Now"}</span>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsCharts({
  keys,
  models,
  usage,
  cooldowns,
  rpmHistory,
  selectedKeyId,
  onSelectKey,
  selectedModelId,
  onSelectModel,
}: AnalyticsChartsProps) {
  const [metric, setMetric] = useState<MetricMode>("rpd");
  const [hoveredCell, setHoveredCell] = useState<{
    keyName: string;
    modelId: string;
    rpd: number;
    rpm: number;
    coolingReason?: "daily" | "minute";
  } | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<{
    keyName: string;
    modelId: string;
    modelName: string;
    count: number;
    sharePct: number;
    color: string;
  } | null>(null);

  const modelMetaMap = useMemo(() => {
    const map = new Map<string, ModelCatalogItem>();
    for (const m of models) map.set(m.id, m);
    return map;
  }, [models]);

  const cooldownLookup = useMemo(() => {
    const map = new Map<string, DashboardCooldownItem>();
    for (const cd of cooldowns) {
      map.set(`${cd.api_key_id}__${cd.model_name}`, cd);
    }
    return map;
  }, [cooldowns]);

  // Rank models with deterministic alphabetical tie-breaker so colors & columns never jump on poll
  const activeModelStats = useMemo(() => {
    const totals = new Map<
      string,
      {
        id: string;
        name: string;
        category: ModelCategory;
        rpd: number;
        rpm: number;
        keyCount: Set<string>;
      }
    >();

    for (const u of usage) {
      if (u.rpd_count === 0 && u.rpm_count === 0) continue;
      const meta = modelMetaMap.get(u.model_name);
      const entry = totals.get(u.model_name) || {
        id: u.model_name,
        name: meta?.name || u.model_name,
        category: meta?.category || "specialized",
        rpd: 0,
        rpm: 0,
        keyCount: new Set<string>(),
      };
      entry.rpd += u.rpd_count;
      entry.rpm += u.rpm_count;
      entry.keyCount.add(u.api_key_id);
      totals.set(u.model_name, entry);
    }

    for (const cd of cooldowns) {
      if (!totals.has(cd.model_name)) {
        const meta = modelMetaMap.get(cd.model_name);
        totals.set(cd.model_name, {
          id: cd.model_name,
          name: meta?.name || cd.model_name,
          category: meta?.category || "specialized",
          rpd: 0,
          rpm: 0,
          keyCount: new Set<string>(),
        });
      }
    }

    return Array.from(totals.values()).sort((a, b) => {
      const aVal = metric === "rpd" ? a.rpd : a.rpm;
      const bVal = metric === "rpd" ? b.rpd : b.rpm;
      if (bVal !== aVal) return bVal - aVal;
      if (b.rpd !== a.rpd) return b.rpd - a.rpd;
      return a.id.localeCompare(b.id);
    });
  }, [usage, cooldowns, modelMetaMap, metric]);

  const modelColors = useMemo(() => {
    const map = new Map<string, string>();
    activeModelStats.forEach((m, idx) => {
      map.set(m.id, MODEL_PALETTE[idx % MODEL_PALETTE.length]);
    });
    return map;
  }, [activeModelStats]);

  // Stacked per-key breakdown with deterministic segment sorting
  const keyBreakdown = useMemo(() => {
    return keys.map((key) => {
      const keyUsages = usage
        .filter((u) => u.api_key_id === key.id)
        .filter((u) => (metric === "rpd" ? u.rpd_count > 0 : u.rpm_count > 0))
        .map((u) => {
          const val = metric === "rpd" ? u.rpd_count : u.rpm_count;
          const meta = modelMetaMap.get(u.model_name);
          return {
            modelId: u.model_name,
            modelName: meta?.name || u.model_name,
            count: val,
            rpd: u.rpd_count,
            rpm: u.rpm_count,
            color: modelColors.get(u.model_name) || "#10b981",
          };
        })
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.modelId.localeCompare(b.modelId);
        });

      const total = keyUsages.reduce((s, item) => s + item.count, 0);
      return {
        key,
        total,
        segments: keyUsages,
      };
    });
  }, [keys, usage, metric, modelMetaMap, modelColors]);

  const maxKeyTotal = useMemo(
    () => Math.max(1, ...keyBreakdown.map((k) => k.total)),
    [keyBreakdown]
  );

  // Category distribution for Donut Chart with deterministic tie-breaking
  const categoryBreakdown = useMemo(() => {
    const map = new Map<ModelCategory, number>();
    for (const item of activeModelStats) {
      const val = metric === "rpd" ? item.rpd : item.rpm;
      if (val <= 0) continue;
      map.set(item.category, (map.get(item.category) || 0) + val);
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    const items = Array.from(map.entries())
      .map(([category, value]) => ({
        category,
        label: CATEGORY_INFO[category].shortLabel,
        color: CATEGORY_INFO[category].colorHex,
        value,
        pct: total > 0 ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.category.localeCompare(b.category);
      });

    return { total, items };
  }, [activeModelStats, metric]);

  const matrixModels = useMemo(() => {
    const list = activeModelStats.slice(0, 10);
    if (selectedModelId && !list.some((m) => m.id === selectedModelId)) {
      const meta = modelMetaMap.get(selectedModelId);
      list.unshift({
        id: selectedModelId,
        name: meta?.name || selectedModelId,
        category: meta?.category || "specialized",
        rpd: 0,
        rpm: 0,
        keyCount: new Set(),
      });
    }
    return list;
  }, [activeModelStats, selectedModelId, modelMetaMap]);

  const maxMatrixCell = useMemo(() => {
    let maxVal = 1;
    for (const u of usage) {
      const val = metric === "rpd" ? u.rpd_count : u.rpm_count;
      if (val > maxVal) maxVal = val;
    }
    return maxVal;
  }, [usage, metric]);

  const matrixUsageLookup = useMemo(() => {
    const map = new Map<string, DashboardUsageItem>();
    for (const u of usage) {
      map.set(`${u.api_key_id}__${u.model_name}`, u);
    }
    return map;
  }, [usage]);

  const donutSegments = useMemo(() => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    let accumulated = 0;

    return categoryBreakdown.items.map((item) => {
      const fraction = categoryBreakdown.total > 0 ? item.value / categoryBreakdown.total : 0;
      const strokeLength = fraction * circumference;
      const dashOffset = -accumulated;
      accumulated += strokeLength;
      return {
        ...item,
        radius,
        circumference,
        strokeLength,
        dashOffset,
      };
    });
  }, [categoryBreakdown]);

  const maxAllTimeKey = useMemo(
    () => Math.max(1, ...keys.map((k) => k.total_requests || 0)),
    [keys]
  );

  const hasFilter = Boolean(selectedKeyId || selectedModelId);

  return (
    <section className="flex flex-col gap-5">
      {/* Section Header & Metric Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-white flex items-center gap-2">
            <BarChart3 size={19} className="text-emerald-400" />
            Traffic &amp; Distribution Telemetry
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Inspect request distribution across API keys, model families, and live cooldown states.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                onSelectKey("");
                onSelectModel("");
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <RotateCcw size={12} />
              Clear filter
            </button>
          )}

          <div className="inline-flex items-center bg-[#0a0a0a] border border-neutral-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMetric("rpd")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                metric === "rpd"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Today (PT)
            </button>
            <button
              type="button"
              onClick={() => setMetric("rpm")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                metric === "rpm"
                  ? "bg-cyan-400 text-black shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Live RPM
            </button>
          </div>
        </div>
      </div>

      {/* Top Row: Stacked Key x Model Breakdown + Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Graph 1: API Key x Model Stacked Breakdown */}
        <div className="lg:col-span-7 bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl min-w-0">
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Flame size={15} className="text-emerald-400" />
                Requests by API Key &amp; Model
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Hover bar segments for exact counts; click a key or model chip to cross-filter.
              </p>
            </div>

            {/* Fixed-height readout bar eliminates layout shift and hover flicker */}
            <div className="h-9 px-3 mb-4 rounded-xl bg-[#0f0f0f] border border-neutral-800/80 flex items-center gap-2 text-xs overflow-hidden">
              {hoveredSegment ? (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: hoveredSegment.color }}
                  />
                  <span className="text-neutral-400 truncate">{hoveredSegment.keyName}</span>
                  <span className="text-neutral-600 shrink-0">→</span>
                  <span className="text-white font-medium truncate">
                    {hoveredSegment.modelName}
                  </span>
                  <span className="ml-auto text-emerald-400 font-[family-name:var(--font-mono)] font-semibold shrink-0 tabular-nums">
                    {hoveredSegment.count.toLocaleString()} ({hoveredSegment.sharePct}%)
                  </span>
                </>
              ) : (
                <span className="text-neutral-500 truncate">
                  Hover any bar segment below to inspect exact model count &amp; share
                </span>
              )}
            </div>

            {keys.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                Add at least one Gemini API key to visualize per-key traffic.
              </div>
            ) : (
              <div className="space-y-3.5">
                {keyBreakdown.map(({ key, total, segments }) => {
                  const isSelected = selectedKeyId === key.id;
                  const coolingCount = key.cooling_models?.length || 0;
                  const barScalePct =
                    maxKeyTotal > 0 ? Math.max(2, (total / maxKeyTotal) * 100) : 0;

                  return (
                    <div
                      key={key.id}
                      onClick={() => onSelectKey(isSelected ? "" : key.id)}
                      className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-emerald-500/5 border-emerald-500/40"
                          : "bg-[#0d0d0d] border-neutral-800/80 hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              key.status === "dead"
                                ? "bg-red-500"
                                : coolingCount > 0
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                            }`}
                          />
                          <span className="font-semibold text-white truncate">{key.name}</span>
                          {coolingCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
                              {coolingCount} cooling
                            </span>
                          )}
                        </div>
                        <span className="font-[family-name:var(--font-mono)] font-semibold text-neutral-200 tabular-nums shrink-0">
                          {total.toLocaleString()}{" "}
                          <span className="text-neutral-500 font-normal">
                            {metric === "rpd" ? "today" : "rpm"}
                          </span>
                        </span>
                      </div>

                      {/* Wrapper-level onMouseLeave prevents flashing between adjacent segments */}
                      <div
                        className="h-3.5 w-full bg-neutral-900 rounded-lg overflow-hidden border border-neutral-800/80 flex"
                        onMouseLeave={() => setHoveredSegment(null)}
                      >
                        {total > 0 ? (
                          <div
                            className="h-full flex overflow-hidden rounded-lg"
                            style={{ width: `${barScalePct}%` }}
                          >
                            {segments.map((seg) => {
                              const pctOfKey = (seg.count / total) * 100;
                              const dimmed =
                                Boolean(selectedModelId) && selectedModelId !== seg.modelId;

                              return (
                                <div
                                  key={seg.modelId}
                                  style={{
                                    width: `${pctOfKey}%`,
                                    backgroundColor: seg.color,
                                    opacity: dimmed ? 0.25 : 1,
                                  }}
                                  className="h-full min-w-[4px] border-r border-black/30 last:border-r-0 transition-opacity hover:brightness-110"
                                  onMouseEnter={() =>
                                    setHoveredSegment({
                                      keyName: key.name || "Key",
                                      modelId: seg.modelId,
                                      modelName: seg.modelName,
                                      count: seg.count,
                                      sharePct: Math.round(pctOfKey),
                                      color: seg.color,
                                    })
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectModel(
                                      selectedModelId === seg.modelId ? "" : seg.modelId
                                    );
                                  }}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <div className="h-full w-full flex items-center px-2 text-[10px] text-neutral-600">
                            No {metric === "rpd" ? "requests today" : "active RPM"}
                          </div>
                        )}
                      </div>

                      {segments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {segments.slice(0, 4).map((seg) => (
                            <button
                              key={seg.modelId}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectModel(
                                  selectedModelId === seg.modelId ? "" : seg.modelId
                                );
                              }}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] border transition-colors ${
                                selectedModelId === seg.modelId
                                  ? "bg-white/10 border-white/30 text-white"
                                  : "bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:text-white"
                              }`}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: seg.color }}
                              />
                              <span className="font-[family-name:var(--font-mono)] truncate max-w-[135px]">
                                {seg.modelId}
                              </span>
                              <span className="text-white font-semibold tabular-nums">
                                {seg.count}
                              </span>
                            </button>
                          ))}
                          {segments.length > 4 && (
                            <span className="text-[10px] text-neutral-500 self-center px-1">
                              +{segments.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {activeModelStats.length > 0 && (
            <div className="mt-4 pt-3 border-t border-neutral-800/80 flex flex-wrap gap-2">
              {activeModelStats.slice(0, 8).map((m) => {
                const color = modelColors.get(m.id) || "#10b981";
                const isSelected = selectedModelId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectModel(isSelected ? "" : m.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                      isSelected
                        ? "bg-emerald-500/15 border-emerald-500/40 text-white"
                        : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate max-w-[150px]">{m.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Graph 2: Model Category Donut & Top Models Share */}
        <div className="lg:col-span-5 bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl min-w-0">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
              <PieChart size={15} className="text-cyan-400" />
              Traffic Share by Model &amp; Type
            </h3>
            <p className="text-xs text-neutral-500 mb-5">
              Distribution across Flash, Flash-Lite, Pro/4, Gemma, and specialized modalities.
            </p>

            {categoryBreakdown.total === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                Send a request through your Gateway Token to populate model share charts.
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-6">
                <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                    <circle
                      cx="70"
                      cy="70"
                      r="54"
                      fill="none"
                      stroke="#171717"
                      strokeWidth="16"
                    />
                    {donutSegments.map((seg) => (
                      <circle
                        key={seg.category}
                        cx="70"
                        cy="70"
                        r={seg.radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="16"
                        strokeDasharray={`${seg.strokeLength} ${seg.circumference}`}
                        strokeDashoffset={seg.dashOffset}
                      />
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-xl font-bold text-white font-[family-name:var(--font-mono)] tabular-nums">
                      {categoryBreakdown.total.toLocaleString()}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                      {metric === "rpd" ? "Today" : "RPM Now"}
                    </span>
                  </div>
                </div>

                <div className="w-full flex-1 space-y-2.5">
                  {categoryBreakdown.items.map((item) => (
                    <div key={item.category} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-neutral-300 font-medium">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2 font-[family-name:var(--font-mono)] tabular-nums">
                        <span className="text-white font-semibold">
                          {item.value.toLocaleString()}
                        </span>
                        <span className="text-neutral-500 w-9 text-right">{item.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activeModelStats.length > 0 && (
            <div className="mt-5 pt-4 border-t border-neutral-800/80 space-y-2.5">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                Top Active Models
              </div>
              {activeModelStats.slice(0, 5).map((m) => {
                const val = metric === "rpd" ? m.rpd : m.rpm;
                const topVal = Math.max(
                  1,
                  metric === "rpd" ? activeModelStats[0].rpd : activeModelStats[0].rpm
                );
                const widthPct = Math.round((val / topVal) * 100);
                const color = modelColors.get(m.id) || "#10b981";
                return (
                  <div
                    key={m.id}
                    onClick={() => onSelectModel(selectedModelId === m.id ? "" : m.id)}
                    className="cursor-pointer group"
                  >
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-300 group-hover:text-white truncate max-w-[200px]">
                        {m.name}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-neutral-400 tabular-nums">
                        <span className="text-white font-semibold">{val.toLocaleString()}</span> ·{" "}
                        {m.keyCount.size} {m.keyCount.size === 1 ? "key" : "keys"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-neutral-900 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${widthPct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Key x Model Heatmap Matrix + Live RPM Pulse & Key Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Graph 3: Key x Model Activity & Cooldown Matrix */}
        <div className="lg:col-span-8 bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 shadow-xl overflow-hidden min-w-0">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Grid3X3 size={15} className="text-emerald-400" />
              Key × Model Heatmap Matrix
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Exact request counts and active 429 cooldown flags across every key-model pair.
            </p>
          </div>

          {/* Fixed-height readout bar prevents layout-shift flicker when hovering cells */}
          <div className="h-9 px-3 mb-4 rounded-xl bg-[#0f0f0f] border border-neutral-800/80 flex items-center gap-2 text-xs overflow-hidden">
            {hoveredCell ? (
              <>
                <span className="text-white font-semibold truncate max-w-[140px]">
                  {hoveredCell.keyName}
                </span>
                <span className="text-neutral-500 shrink-0">×</span>
                <span className="text-cyan-300 font-[family-name:var(--font-mono)] truncate">
                  {hoveredCell.modelId}
                </span>
                <span className="ml-auto text-emerald-400 font-[family-name:var(--font-mono)] font-semibold shrink-0 tabular-nums">
                  {hoveredCell.rpd} today · {hoveredCell.rpm} rpm
                </span>
                {hoveredCell.coolingReason && (
                  <span className="text-amber-300 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 shrink-0">
                    {hoveredCell.coolingReason === "daily" ? "Cooling (PT)" : "Cooling (RPM)"}
                  </span>
                )}
              </>
            ) : (
              <span className="text-neutral-500 truncate">
                Hover any cell to inspect pair traffic &amp; cooldown state · Click to filter
              </span>
            )}
          </div>

          {keys.length === 0 || matrixModels.length === 0 ? (
            <div className="py-10 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
              Heatmap populates automatically once requests or cooldowns occur across your keys.
            </div>
          ) : (
            <div className="overflow-x-auto pb-1">
              <table className="w-full border-separate border-spacing-1.5 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[#0a0a0a] text-left text-[11px] text-neutral-500 font-medium px-2 py-1 min-w-[110px]">
                      API Key
                    </th>
                    {matrixModels.map((m) => (
                      <th
                        key={m.id}
                        onClick={() => onSelectModel(selectedModelId === m.id ? "" : m.id)}
                        className={`text-center font-[family-name:var(--font-mono)] text-[10px] px-2 py-1.5 rounded-lg cursor-pointer transition-colors min-w-[92px] ${
                          selectedModelId === m.id
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "text-neutral-400 hover:text-white bg-[#0d0d0d]"
                        }`}
                        title={m.name}
                      >
                        <div className="truncate max-w-[92px]">{m.id}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody onMouseLeave={() => setHoveredCell(null)}>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td
                        onClick={() => onSelectKey(selectedKeyId === k.id ? "" : k.id)}
                        className={`sticky left-0 z-10 bg-[#0a0a0a] px-2 py-1.5 font-medium cursor-pointer rounded-lg transition-colors ${
                          selectedKeyId === k.id
                            ? "text-emerald-400"
                            : "text-neutral-300 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 max-w-[125px]">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              k.status === "dead" ? "bg-red-500" : "bg-emerald-500"
                            }`}
                          />
                          <span className="truncate">{k.name}</span>
                        </div>
                      </td>
                      {matrixModels.map((m) => {
                        const row = matrixUsageLookup.get(`${k.id}__${m.id}`);
                        const cd = cooldownLookup.get(`${k.id}__${m.id}`);
                        const rpd = row?.rpd_count || 0;
                        const rpm = row?.rpm_count || 0;
                        const val = metric === "rpd" ? rpd : rpm;
                        const intensity = val > 0 ? Math.max(0.18, val / maxMatrixCell) : 0;

                        return (
                          <td key={m.id} className="p-0">
                            <div
                              onMouseEnter={() =>
                                setHoveredCell({
                                  keyName: k.name || "Key",
                                  modelId: m.id,
                                  rpd,
                                  rpm,
                                  coolingReason: cd?.reason,
                                })
                              }
                              onClick={() => {
                                onSelectKey(k.id);
                                onSelectModel(m.id);
                              }}
                              style={{
                                backgroundColor: cd
                                  ? "rgba(245, 158, 11, 0.14)"
                                  : val > 0
                                    ? `rgba(16, 185, 129, ${(intensity * 0.55).toFixed(2)})`
                                    : "#0f0f0f",
                              }}
                              className={`h-9 rounded-lg border flex items-center justify-center gap-1 font-[family-name:var(--font-mono)] tabular-nums cursor-pointer transition-colors duration-150 hover:ring-1 hover:ring-white/40 hover:brightness-110 ${
                                cd
                                  ? "border-amber-500/40 text-amber-300"
                                  : val > 0
                                    ? "border-emerald-500/30 text-white font-semibold"
                                    : "border-neutral-800/60 text-neutral-700"
                              }`}
                            >
                              <span className="pointer-events-none">{val}</span>
                              {cd && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-amber-400 pointer-events-none"
                                  title="Currently cooling down"
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Graph 4: Live RPM Pulse + Key Throughput vs Errors */}
        <div className="lg:col-span-4 bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between gap-5 shadow-xl min-w-0">
          <LiveRpmPulseCard rpmHistory={rpmHistory} />

          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
              <ShieldCheck size={15} className="text-emerald-400" />
              All-Time Pool Volume &amp; Errors
            </h3>
            <p className="text-xs text-neutral-500 mb-3">
              Cumulative attempts vs upstream errors per key.
            </p>

            {keys.length === 0 ? (
              <div className="text-xs text-neutral-600 py-4 text-center">No keys added yet.</div>
            ) : (
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {keys.map((k) => {
                  const reqs = k.total_requests || 0;
                  const errs = k.total_errors || 0;
                  const okCount = Math.max(0, reqs - errs);
                  const okPct = Math.round((okCount / maxAllTimeKey) * 100);
                  const errPct = Math.round((errs / maxAllTimeKey) * 100);

                  return (
                    <div
                      key={k.id}
                      onClick={() => onSelectKey(selectedKeyId === k.id ? "" : k.id)}
                      className="cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-neutral-300 group-hover:text-white truncate max-w-[140px]">
                          {k.name}
                        </span>
                        <span className="font-[family-name:var(--font-mono)] tabular-nums text-[11px]">
                          <span className="text-emerald-400">{reqs.toLocaleString()}</span>
                          {errs > 0 && <span className="text-red-400 ml-1.5">({errs} err)</span>}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500/80"
                          style={{ width: `${okPct}%` }}
                        />
                        {errs > 0 && (
                          <div
                            className="h-full bg-red-500/80"
                            style={{ width: `${errPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}