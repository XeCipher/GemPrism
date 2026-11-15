"use client";

import React, { useMemo, useState } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Layers,
  Clock,
} from "lucide-react";
import { useDashboard } from "@/components/DashboardContext";
import type { DashboardUsageItem } from "@/components/AnalyticsCharts";

function formatCooldownRemaining(
  untilMs: number,
  reason: "daily" | "minute",
  nowMs: number
): string {
  if (reason === "daily") return "Resets PT midnight";
  const diffSec = Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
  if (diffSec >= 60) return `${Math.ceil(diffSec / 60)}m left`;
  return `${diffSec}s left`;
}

function StatusBadge({
  status,
  coolingCount = 0,
}: {
  status: string;
  coolingCount?: number;
}) {
  if (status === "dead") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold tracking-wide uppercase bg-red-500/10 text-red-400 border-red-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Dead
      </span>
    );
  }

  if (status === "cooling" || coolingCount > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold tracking-wide uppercase bg-amber-500/10 text-amber-300 border-amber-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        {coolingCount > 0 ? `Healthy · ${coolingCount} Cooling` : "Cooling"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Healthy
    </span>
  );
}

export default function KeysPoolPage() {
  const {
    data,
    nowMs,
    selectedKeyId,
    setSelectedKeyId,
    selectedModelId,
    setSelectedModelId,
    addKey,
    deleteKey,
    reviveKey,
    clearAllCooldowns,
  } = useDashboard();

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revivingId, setRevivingId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const modelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of data?.models || []) map.set(m.id, m.name);
    return map;
  }, [data]);

  const usageByKey = useMemo(() => {
    const map = new Map<string, DashboardUsageItem[]>();
    for (const u of data?.usage || []) {
      const list = map.get(u.api_key_id) || [];
      list.push(u);
      map.set(u.api_key_id, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => {
        if (b.rpd_count !== a.rpd_count) return b.rpd_count - a.rpd_count;
        if (b.rpm_count !== a.rpm_count) return b.rpm_count - a.rpm_count;
        return a.model_name.localeCompare(b.model_name);
      });
      map.set(k, list);
    }
    return map;
  }, [data]);

  if (!data) return null;

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyValue.trim()) return;
    setIsAdding(true);
    const ok = await addKey(newKeyName, newKeyValue);
    if (ok) {
      setNewKeyName("");
      setNewKeyValue("");
    }
    setIsAdding(false);
  };

  const handleDeleteClick = async (keyId: string) => {
    if (confirmDelete !== keyId) {
      setConfirmDelete(keyId);
      setTimeout(() => setConfirmDelete((id) => (id === keyId ? null : id)), 3000);
      return;
    }
    setConfirmDelete(null);
    setDeletingId(keyId);
    await deleteKey(keyId);
    setDeletingId(null);
  };

  const handleReviveClick = async (keyId: string) => {
    setRevivingId(keyId);
    await reviveKey(keyId);
    setRevivingId(null);
  };

  const toggleExpandKey = (keyId: string) => {
    setExpandedKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-white flex items-center gap-2">
            <KeyRound size={19} className="text-emerald-400" />
            API Keys Pool
            <span className="text-neutral-400 font-normal text-xs bg-neutral-900 border border-neutral-800 px-2.5 py-0.5 rounded-full">
              {data.keys.length}
            </span>
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Expand any key to inspect per-model request counts and active cooldown timers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
            {data.summary.active} Healthy
          </span>
          {data.cooldowns.length > 0 && (
            <button
              type="button"
              onClick={() => void clearAllCooldowns()}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 font-medium transition-colors"
            >
              <RotateCw size={12} />
              Clear {data.cooldowns.length} Cooldowns
            </button>
          )}
          {data.summary.dead > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
              {data.summary.dead} Dead
            </span>
          )}
        </div>
      </div>

      {/* Add Key Form */}
      <form
        onSubmit={handleAddSubmit}
        className="flex flex-col sm:flex-row gap-2.5 bg-[#0a0a0a] p-3 sm:p-4 rounded-2xl border border-neutral-800 shadow-lg"
      >
        <input
          type="text"
          placeholder={`Key Name (e.g. Key-${data.keys.length + 1})`}
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          className="w-full sm:w-1/4 bg-[#0d0d0d] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3 outline-none transition-colors text-sm font-medium"
        />
        <input
          type="text"
          placeholder="Paste a Google Gemini API Key (AIzaSy…)"
          value={newKeyValue}
          onChange={(e) => setNewKeyValue(e.target.value)}
          className="w-full flex-1 bg-[#0d0d0d] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3 outline-none transition-colors text-sm font-[family-name:var(--font-mono)]"
          required
        />
        <button
          type="submit"
          disabled={isAdding}
          className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-60 text-black px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shrink-0"
        >
          <Plus size={16} />
          {isAdding ? "Adding…" : "Add Key"}
        </button>
      </form>

      {data.keys.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl flex flex-col items-center justify-center py-14 gap-3 text-neutral-600 shadow-xl">
          <KeyRound size={36} className="opacity-30 mb-1" />
          <p className="text-sm font-medium text-neutral-300">No Gemini API keys added yet.</p>
          <p className="text-xs text-neutral-500 max-w-sm text-center">
            Add one or more Gemini API keys above — GemPrism will auto-discover all live models and load-balance requests across your pool.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.keys.map((k) => {
            const keyUsages = usageByKey.get(k.id) || [];
            const rpdToday = keyUsages.reduce((s, u) => s + u.rpd_count, 0);
            const rpmNow = keyUsages.reduce((s, u) => s + u.rpm_count, 0);
            const coolingModels = k.cooling_models || [];
            const isExpanded = Boolean(expandedKeys[k.id]);
            const isSelected = selectedKeyId === k.id;
            const needsReset = k.status !== "healthy" || coolingModels.length > 0;

            return (
              <div
                key={k.id}
                className={`bg-[#0a0a0a] border rounded-2xl transition-colors shadow-lg overflow-hidden ${
                  isSelected ? "border-emerald-500/40" : "border-neutral-800"
                }`}
              >
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5 mb-1">
                      <button
                        type="button"
                        onClick={() => setSelectedKeyId(isSelected ? "" : k.id)}
                        className="font-semibold text-white hover:text-emerald-400 transition-colors text-base text-left truncate"
                      >
                        {k.name}
                      </button>
                      <StatusBadge status={k.status} coolingCount={coolingModels.length} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <code className="text-neutral-500 text-xs font-[family-name:var(--font-mono)]">
                        {k.key_value}
                      </code>
                      {k.last_error && k.total_errors > 0 && (
                        <span
                          className="text-[11px] text-red-400/80 truncate max-w-[260px] sm:max-w-[380px]"
                          title={k.last_error}
                        >
                          Last error: {k.last_error}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 sm:gap-6">
                    <div className="grid grid-cols-4 gap-4 sm:gap-6 text-center">
                      <div>
                        <div
                          className={`font-[family-name:var(--font-mono)] font-semibold text-sm sm:text-base tabular-nums ${
                            rpdToday > 0 ? "text-emerald-400" : "text-neutral-500"
                          }`}
                        >
                          {rpdToday.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                          Today
                        </div>
                      </div>

                      <div>
                        <div
                          className={`font-[family-name:var(--font-mono)] font-semibold text-sm sm:text-base tabular-nums ${
                            rpmNow > 0 ? "text-cyan-400" : "text-neutral-500"
                          }`}
                        >
                          {rpmNow.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                          RPM
                        </div>
                      </div>

                      <div>
                        <div className="font-[family-name:var(--font-mono)] font-semibold text-sm sm:text-base text-neutral-200 tabular-nums">
                          {(k.total_requests || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                          All-Time
                        </div>
                      </div>

                      <div>
                        <div
                          className={`font-[family-name:var(--font-mono)] font-semibold text-sm sm:text-base tabular-nums ${
                            k.total_errors > 0 ? "text-red-400" : "text-neutral-600"
                          }`}
                        >
                          {(k.total_errors || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                          Errors
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpandKey(k.id)}
                        className="text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111] hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition-colors font-medium"
                      >
                        <Layers size={13} className="text-emerald-400" />
                        <span>Models ({keyUsages.length})</span>
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>

                      {needsReset && (
                        <button
                          type="button"
                          onClick={() => void handleReviveClick(k.id)}
                          disabled={revivingId === k.id}
                          className="text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 transition-colors font-medium disabled:opacity-50"
                          title="Revive key / clear active model cooldowns"
                        >
                          <RotateCw
                            size={13}
                            className={revivingId === k.id ? "animate-spin" : ""}
                          />
                          <span className="hidden sm:inline">Reset</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleDeleteClick(k.id)}
                        disabled={deletingId === k.id}
                        className={`text-xs flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-colors font-medium disabled:opacity-40 ${
                          confirmDelete === k.id
                            ? "bg-red-500/15 border border-red-500/30 text-red-400"
                            : "bg-neutral-900 hover:bg-red-500/10 text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-500/30"
                        }`}
                      >
                        {deletingId === k.id ? (
                          <span className="w-3.5 h-3.5 rounded-full border border-neutral-600 border-t-white animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        <span className="hidden sm:inline">
                          {confirmDelete === k.id ? "Confirm" : "Remove"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline Chips Preview (Collapsed) */}
                {!isExpanded && (keyUsages.length > 0 || coolingModels.length > 0) && (
                  <div className="px-4 sm:px-5 pb-3.5 pt-0 flex flex-wrap gap-1.5">
                    {keyUsages.slice(0, 5).map((u) => (
                      <button
                        key={u.model_name}
                        type="button"
                        onClick={() =>
                          setSelectedModelId(selectedModelId === u.model_name ? "" : u.model_name)
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                          selectedModelId === u.model_name
                            ? "bg-emerald-500/15 border-emerald-500/40 text-white"
                            : "bg-[#0d0d0d] border-neutral-800/90 text-neutral-400 hover:text-white"
                        }`}
                      >
                        <span className="font-[family-name:var(--font-mono)]">{u.model_name}</span>
                        <span className="text-emerald-400 font-semibold font-[family-name:var(--font-mono)] tabular-nums">
                          {u.rpd_count}
                        </span>
                        {u.rpm_count > 0 && (
                          <span className="text-cyan-400 font-[family-name:var(--font-mono)] tabular-nums">
                            · {u.rpm_count}/m
                          </span>
                        )}
                      </button>
                    ))}
                    {coolingModels.slice(0, 3).map((cd) => (
                      <span
                        key={`cd_${cd.model_name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-amber-500/10 border border-amber-500/25 text-amber-300"
                      >
                        <Clock size={10} />
                        <span className="font-[family-name:var(--font-mono)]">{cd.model_name}</span>
                        <span className="opacity-80">
                          ({formatCooldownRemaining(cd.until, cd.reason, nowMs)})
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded Per-Key Model Breakdown */}
                {isExpanded && (
                  <div className="border-t border-neutral-800/80 bg-[#070707] p-4 sm:p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Models Served by {k.name}
                      </h4>
                      <span className="text-[11px] text-neutral-500">
                        Counts reflect fulfilled requests
                      </span>
                    </div>

                    {keyUsages.length === 0 ? (
                      <p className="text-xs text-neutral-500 py-2">
                        No requests recorded on this key yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {keyUsages.map((u) => {
                          const cd = coolingModels.find((c) => c.model_name === u.model_name);
                          const displayName = modelNameMap.get(u.model_name) || u.model_name;
                          return (
                            <div
                              key={u.model_name}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                                cd
                                  ? "bg-amber-500/5 border-amber-500/30"
                                  : "bg-[#0d0d0d] border-neutral-800"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-white truncate">
                                  {displayName}
                                </div>
                                <div className="text-[11px] text-neutral-500 font-[family-name:var(--font-mono)] truncate">
                                  {u.model_name}
                                </div>
                                {cd && (
                                  <div className="text-[10px] text-amber-300 mt-1 flex items-center gap-1">
                                    <Clock size={10} />
                                    {formatCooldownRemaining(cd.until, cd.reason, nowMs)}
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0 font-[family-name:var(--font-mono)] tabular-nums">
                                <div className="text-sm font-semibold text-emerald-400">
                                  {u.rpd_count.toLocaleString()}
                                  <span className="text-[10px] text-neutral-500 font-normal ml-1">
                                    today
                                  </span>
                                </div>
                                <div className="text-[11px] text-cyan-400">
                                  {u.rpm_count.toLocaleString()} rpm
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {coolingModels.some(
                      (cd) => !keyUsages.some((u) => u.model_name === cd.model_name)
                    ) && (
                      <div className="pt-2 border-t border-neutral-800/60">
                        <div className="text-[11px] uppercase tracking-wider text-amber-400/90 font-semibold mb-2">
                          Active Cooldowns (0 served before limit hit)
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {coolingModels
                            .filter(
                              (cd) => !keyUsages.some((u) => u.model_name === cd.model_name)
                            )
                            .map((cd) => (
                              <span
                                key={cd.model_name}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-[family-name:var(--font-mono)]"
                              >
                                <Clock size={11} />
                                {cd.model_name} ·{" "}
                                {formatCooldownRemaining(cd.until, cd.reason, nowMs)}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}