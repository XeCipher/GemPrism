"use client";

import React, { useMemo, useState } from "react";
import {
  Database,
  ChevronDown,
  ArrowUpDown,
  Search,
  Copy,
  Check,
  Clock,
  RotateCcw,
} from "lucide-react";
import { useDashboard } from "@/components/DashboardContext";
import type { DashboardCooldownItem } from "@/components/AnalyticsCharts";
import {
  buildModelFallbackChain,
  CATEGORY_INFO,
  CATEGORY_ORDER,
  compareModelsInCatalog,
  type ModelCategory,
} from "@/lib/geminiModels";

type SortOption = "sequence" | "rpd_desc" | "rpm_desc" | "newest" | "alpha";
type QuickFilter = "all" | "active_today" | "cooling" | "text_only";

function formatTokenLimit(tokens: number | null): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M ctx`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return `${tokens} ctx`;
}

export default function ModelsCatalogPage() {
  const {
    data,
    selectedKeyId,
    setSelectedKeyId,
    selectedModelId,
    setSelectedModelId,
    copiedId,
    handleCopy,
  } = useDashboard();

  const [modelSearch, setModelSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("sequence");
  const [expandedFallbacks, setExpandedFallbacks] = useState<Record<string, boolean>>({});

  const keyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of data?.keys || []) map.set(k.id, k.name || "Key");
    return map;
  }, [data]);

  const usageByModel = useMemo(() => {
    const map = new Map<
      string,
      {
        rpd: number;
        rpm: number;
        perKey: Array<{ keyId: string; keyName: string; rpd: number; rpm: number }>;
      }
    >();

    for (const u of data?.usage || []) {
      if (selectedKeyId && u.api_key_id !== selectedKeyId) continue;
      const entry = map.get(u.model_name) || { rpd: 0, rpm: 0, perKey: [] };
      entry.rpd += u.rpd_count;
      entry.rpm += u.rpm_count;
      if (u.rpd_count > 0 || u.rpm_count > 0) {
        entry.perKey.push({
          keyId: u.api_key_id,
          keyName: keyNameMap.get(u.api_key_id) || "Key",
          rpd: u.rpd_count,
          rpm: u.rpm_count,
        });
      }
      map.set(u.model_name, entry);
    }

    for (const entry of map.values()) {
      entry.perKey.sort((a, b) => {
        if (b.rpd !== a.rpd) return b.rpd - a.rpd;
        return a.keyName.localeCompare(b.keyName);
      });
    }

    return map;
  }, [data, selectedKeyId, keyNameMap]);

  const cooldownsByModel = useMemo(() => {
    const map = new Map<string, DashboardCooldownItem[]>();
    for (const cd of data?.cooldowns || []) {
      if (selectedKeyId && cd.api_key_id !== selectedKeyId) continue;
      const list = map.get(cd.model_name) || [];
      list.push(cd);
      map.set(cd.model_name, list);
    }
    return map;
  }, [data, selectedKeyId]);

  const categoryCounts = useMemo(() => {
    const counts: Record<ModelCategory, number> = {
      flash: 0,
      "flash-lite": 0,
      pro: 0,
      gemma: 0,
      image: 0,
      tts: 0,
      live: 0,
      media: 0,
      embedding: 0,
      specialized: 0,
    };
    for (const m of data?.models || []) {
      counts[m.category] = (counts[m.category] || 0) + 1;
    }
    return counts;
  }, [data]);

  const filteredModels = useMemo(() => {
    const models = data?.models || [];
    const q = modelSearch.trim().toLowerCase();

    const filtered = models.filter((m) => {
      if (selectedModelId && m.id !== selectedModelId) return false;
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;

      if (q) {
        const hay = `${m.id} ${m.name} ${m.description} ${m.aliasTarget || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      const u = usageByModel.get(m.id);
      const cds = cooldownsByModel.get(m.id) || [];

      if (quickFilter === "active_today" && (!u || u.rpd === 0)) return false;
      if (quickFilter === "cooling" && cds.length === 0) return false;
      if (quickFilter === "text_only" && !m.methods.includes("generateContent")) return false;

      return true;
    });

    return [...filtered].sort((a, b) => {
      const ua = usageByModel.get(a.id) || { rpd: 0, rpm: 0 };
      const ub = usageByModel.get(b.id) || { rpd: 0, rpm: 0 };

      if (sortOption === "rpd_desc") {
        if (ub.rpd !== ua.rpd) return ub.rpd - ua.rpd;
        if (ub.rpm !== ua.rpm) return ub.rpm - ua.rpm;
        return compareModelsInCatalog(a, b);
      }

      if (sortOption === "rpm_desc") {
        if (ub.rpm !== ua.rpm) return ub.rpm - ua.rpm;
        if (ub.rpd !== ua.rpd) return ub.rpd - ua.rpd;
        return compareModelsInCatalog(a, b);
      }

      if (sortOption === "newest") {
        const len = Math.max(a.versionParts.length, b.versionParts.length);
        for (let i = 0; i < len; i++) {
          const diff = (b.versionParts[i] || 0) - (a.versionParts[i] || 0);
          if (diff !== 0) return diff;
        }
        return compareModelsInCatalog(a, b);
      }

      if (sortOption === "alpha") {
        return a.name.localeCompare(b.name);
      }

      return compareModelsInCatalog(a, b);
    });
  }, [
    data,
    modelSearch,
    categoryFilter,
    quickFilter,
    sortOption,
    selectedModelId,
    usageByModel,
    cooldownsByModel,
  ]);

  const maxModelRpdInView = useMemo(() => {
    let max = 1;
    for (const m of filteredModels) {
      const rpd = usageByModel.get(m.id)?.rpd || 0;
      if (rpd > max) max = rpd;
    }
    return max;
  }, [filteredModels, usageByModel]);

  if (!data) return null;

  const toggleExpandFallback = (modelId: string) => {
    setExpandedFallbacks((prev) => ({ ...prev, [modelId]: !prev[modelId] }));
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-white flex items-center gap-2 mb-1">
            <Database size={19} className="text-emerald-400" />
            Live Model Catalog &amp; Routing Sequence
          </h1>
          <p className="text-xs text-neutral-500">
            Automatically synced from Google Gemini API — organized by Flash, Flash-Lite, Pro &amp; Frontier, Gemma, and specialized modalities.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(selectedKeyId || selectedModelId) && (
            <button
              type="button"
              onClick={() => {
                setSelectedKeyId("");
                setSelectedModelId("");
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <RotateCcw size={12} />
              Clear filter
            </button>
          )}

          <div className="relative">
            <select
              value={selectedKeyId}
              onChange={(e) => setSelectedKeyId(e.target.value)}
              className="bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 focus:border-emerald-500 text-white rounded-xl pl-3.5 pr-8 py-2 outline-none transition-colors text-xs appearance-none cursor-pointer"
            >
              <option value="" className="bg-[#0a0a0a] text-white">
                All Keys (Combined)
              </option>
              {data.keys.map((k) => (
                <option key={k.id} value={k.id} className="bg-[#0a0a0a] text-white">
                  Key: {k.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500"
            />
          </div>

          <div className="relative">
            <ArrowUpDown
              size={12}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500"
            />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 focus:border-emerald-500 text-white rounded-xl pl-8 pr-8 py-2 outline-none transition-colors text-xs appearance-none cursor-pointer"
            >
              <option value="sequence" className="bg-[#0a0a0a] text-white">
                Sort: Recommended Sequence
              </option>
              <option value="rpd_desc" className="bg-[#0a0a0a] text-white">
                Sort: Most Used Today
              </option>
              <option value="rpm_desc" className="bg-[#0a0a0a] text-white">
                Sort: Highest Live RPM
              </option>
              <option value="newest" className="bg-[#0a0a0a] text-white">
                Sort: Newest Version First
              </option>
              <option value="alpha" className="bg-[#0a0a0a] text-white">
                Sort: Alphabetical (A–Z)
              </option>
            </select>
            <ChevronDown
              size={13}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500"
            />
          </div>
        </div>
      </div>

      {/* Search + Quick Filters + Category Pills */}
      <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="text"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder="Search models (e.g. flash, 3.8, hydrogen, gemma, image, tts)…"
              className="w-full bg-[#0d0d0d] border border-neutral-800 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All" },
                { id: "active_today", label: "Active Today" },
                { id: "cooling", label: "Cooling Now" },
                { id: "text_only", label: "Text / Chat" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setQuickFilter(pill.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  quickFilter === pill.id
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                    : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border shrink-0 transition-colors ${
              categoryFilter === "all"
                ? "bg-white text-black border-white"
                : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            All ({data.models.length})
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const count = categoryCounts[cat] || 0;
            if (count === 0) return null;
            const info = CATEGORY_INFO[cat];
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(active ? "all" : cat)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shrink-0 transition-colors ${
                  active
                    ? "bg-emerald-500 text-black border-emerald-500"
                    : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: active ? "#000" : info.colorHex }}
                />
                {info.shortLabel}
                <span className="opacity-75">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Catalog List */}
      <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredModels.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500">
            No models match your current filters.
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[#0d0d0d] border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="px-5 py-3.5 font-normal">Model &amp; Family</th>
                    <th className="px-5 py-3.5 font-normal">API Identifier</th>
                    <th className="px-5 py-3.5 font-normal text-right">Today</th>
                    <th className="px-5 py-3.5 font-normal text-right">Live RPM</th>
                    <th className="px-5 py-3.5 font-normal">Serving Keys &amp; Failover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {filteredModels.map((m) => {
                    const u = usageByModel.get(m.id) || { rpd: 0, rpm: 0, perKey: [] };
                    const cds = cooldownsByModel.get(m.id) || [];
                    const catInfo = CATEGORY_INFO[m.category];
                    const ctxLabel = formatTokenLimit(m.inputTokenLimit);
                    const showFb = Boolean(expandedFallbacks[m.id]);
                    const fallbackPreview = showFb
                      ? buildModelFallbackChain(m.id, data.models).slice(1, 6)
                      : [];
                    const relPct =
                      u.rpd > 0 ? Math.max(6, Math.round((u.rpd / maxModelRpdInView) * 100)) : 0;

                    return (
                      <React.Fragment key={m.id}>
                        <tr className="hover:bg-[#0d0d0d] transition-colors">
                          <td className="px-5 py-4 align-top">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-semibold text-white">{m.name}</span>
                              <span
                                className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide ${catInfo.badgeClass}`}
                              >
                                {catInfo.shortLabel}
                              </span>
                              {m.isAlias && m.aliasTarget && (
                                <span className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-700 text-[10px] text-cyan-300 font-[family-name:var(--font-mono)]">
                                  → {m.aliasTarget}
                                </span>
                              )}
                              {ctxLabel && (
                                <span className="text-[10px] text-neutral-500 font-[family-name:var(--font-mono)]">
                                  {ctxLabel}
                                </span>
                              )}
                            </div>
                            {m.description && (
                              <p className="text-xs text-neutral-500 line-clamp-1 max-w-md">
                                {m.description}
                              </p>
                            )}
                          </td>

                          <td className="px-5 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => handleCopy(m.id)}
                              className="inline-flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white text-xs transition-colors font-[family-name:var(--font-mono)]"
                              title="Copy API identifier"
                            >
                              {m.id}
                              {copiedId === m.id ? (
                                <Check size={12} className="text-emerald-400 shrink-0" />
                              ) : (
                                <Copy size={12} className="shrink-0" />
                              )}
                            </button>
                          </td>

                          <td className="px-5 py-4 align-top text-right">
                            <div
                              className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${
                                u.rpd > 0 ? "text-emerald-400" : "text-neutral-600"
                              }`}
                            >
                              {u.rpd.toLocaleString()}
                            </div>
                            {u.rpd > 0 && (
                              <div className="mt-1.5 h-1 w-20 ml-auto bg-neutral-900 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${relPct}%` }}
                                />
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4 align-top text-right">
                            <span
                              className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${
                                u.rpm > 0 ? "text-cyan-400" : "text-neutral-600"
                              }`}
                            >
                              {u.rpm.toLocaleString()}
                            </span>
                          </td>

                          <td className="px-5 py-4 align-top">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {u.perKey.map((pk) => (
                                <button
                                  key={pk.keyId}
                                  type="button"
                                  onClick={() =>
                                    setSelectedKeyId(selectedKeyId === pk.keyId ? "" : pk.keyId)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#111] border border-neutral-800 text-[11px] text-neutral-300 hover:border-emerald-500/40 transition-colors"
                                >
                                  <span>{pk.keyName}:</span>
                                  <span className="text-emerald-400 font-[family-name:var(--font-mono)] font-semibold">
                                    {pk.rpd}
                                  </span>
                                </button>
                              ))}
                              {cds.map((cd) => (
                                <span
                                  key={`${cd.api_key_id}_${cd.model_name}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300"
                                >
                                  <Clock size={10} />
                                  {keyNameMap.get(cd.api_key_id) || "Key"} cooling
                                </span>
                              ))}
                              <button
                                type="button"
                                onClick={() => toggleExpandFallback(m.id)}
                                className="text-[11px] text-neutral-500 hover:text-emerald-400 px-1.5 py-0.5 rounded transition-colors"
                              >
                                {showFb ? "Hide chain" : "Fallback chain"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {showFb && (
                          <tr className="bg-[#070707]">
                            <td colSpan={5} className="px-5 py-3 text-xs text-neutral-400">
                              <span className="text-neutral-500 font-semibold mr-2">
                                Auto-failover sequence:
                              </span>
                              <span className="font-[family-name:var(--font-mono)] text-emerald-300">
                                {m.aliasTarget || m.id}
                              </span>
                              {fallbackPreview.map((fbId) => (
                                <React.Fragment key={fbId}>
                                  <span className="text-neutral-600 mx-1.5">→</span>
                                  <span className="font-[family-name:var(--font-mono)] text-neutral-300">
                                    {fbId}
                                  </span>
                                </React.Fragment>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col divide-y divide-neutral-800/60">
              {filteredModels.map((m) => {
                const u = usageByModel.get(m.id) || { rpd: 0, rpm: 0, perKey: [] };
                const cds = cooldownsByModel.get(m.id) || [];
                const catInfo = CATEGORY_INFO[m.category];
                const showFb = Boolean(expandedFallbacks[m.id]);
                const fallbackPreview = showFb
                  ? buildModelFallbackChain(m.id, data.models).slice(1, 5)
                  : [];

                return (
                  <div key={m.id} className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-semibold text-white text-sm">{m.name}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase ${catInfo.badgeClass}`}
                          >
                            {catInfo.shortLabel}
                          </span>
                        </div>
                        {m.isAlias && m.aliasTarget && (
                          <div className="text-[11px] text-cyan-300 font-[family-name:var(--font-mono)]">
                            Points to {m.aliasTarget}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(m.id)}
                        className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-md text-neutral-300 text-[10px] font-[family-name:var(--font-mono)] shrink-0"
                      >
                        {m.id}
                        {copiedId === m.id ? (
                          <Check size={10} className="text-emerald-400" />
                        ) : (
                          <Copy size={10} />
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-[#0d0d0d] p-2.5 rounded-xl border border-neutral-800/60 text-center">
                      <div>
                        <div
                          className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${
                            u.rpd > 0 ? "text-emerald-400" : "text-neutral-500"
                          }`}
                        >
                          {u.rpd.toLocaleString()}
                        </div>
                        <div className="text-[9px] text-neutral-500 uppercase">Today</div>
                      </div>
                      <div>
                        <div
                          className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${
                            u.rpm > 0 ? "text-cyan-400" : "text-neutral-500"
                          }`}
                        >
                          {u.rpm.toLocaleString()}
                        </div>
                        <div className="text-[9px] text-neutral-500 uppercase">Live RPM</div>
                      </div>
                    </div>

                    {(u.perKey.length > 0 || cds.length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {u.perKey.map((pk) => (
                          <span
                            key={pk.keyId}
                            className="text-[10px] px-2 py-0.5 rounded bg-[#111] border border-neutral-800 text-neutral-300"
                          >
                            {pk.keyName}:{" "}
                            <strong className="text-emerald-400 font-[family-name:var(--font-mono)]">
                              {pk.rpd}
                            </strong>
                          </span>
                        ))}
                        {cds.map((cd) => (
                          <span
                            key={`${cd.api_key_id}_${cd.model_name}`}
                            className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300"
                          >
                            {keyNameMap.get(cd.api_key_id) || "Key"} cooling
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleExpandFallback(m.id)}
                      className="text-left text-[11px] text-neutral-500 hover:text-emerald-400"
                    >
                      {showFb ? "Hide fallback chain" : "Show auto-failover sequence →"}
                    </button>

                    {showFb && (
                      <div className="text-[11px] bg-[#070707] border border-neutral-800 rounded-lg p-2.5 font-[family-name:var(--font-mono)] text-neutral-400 break-words">
                        <span className="text-emerald-300">{m.aliasTarget || m.id}</span>
                        {fallbackPreview.map((fbId) => ` → ${fbId}`).join("")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}