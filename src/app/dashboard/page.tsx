"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabaseClient } from "@/lib/supabase";
import {
  Activity,
  ShieldAlert,
  Zap,
  ServerCrash,
  Copy,
  Check,
  Database,
  Plus,
  LogOut,
  Trash2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  KeyRound,
  TrendingUp,
  Code as CodeIcon,
  Search,
  RotateCw,
  Sparkles,
  ArrowUpDown,
  Layers,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { CodeBlock } from "@/components/CodeBlock";
import { LogoLayeredCore } from "@/components/Logo";
import {
  AnalyticsCharts,
  type DashboardCooldownItem,
  type DashboardKeyItem,
  type DashboardUsageItem,
} from "@/components/AnalyticsCharts";
import {
  buildModelFallbackChain,
  CATEGORY_INFO,
  CATEGORY_ORDER,
  compareModelsInCatalog,
  type CatalogMetadata,
  type ModelCatalogItem,
  type ModelCategory,
} from "@/lib/geminiModels";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardPayload {
  token: string;
  keys: DashboardKeyItem[];
  models: ModelCatalogItem[];
  catalogMeta: CatalogMetadata;
  usage: DashboardUsageItem[];
  cooldowns: DashboardCooldownItem[];
  todayStr: string;
  summary: {
    total_requests: number;
    today_requests: number;
    active_rpm: number;
    total_errors: number;
    active: number;
    cooling: number;
    dead: number;
    discovered_models: number;
  };
}

type SortOption = "sequence" | "rpd_desc" | "rpm_desc" | "newest" | "alpha";
type QuickFilter = "all" | "active_today" | "cooling" | "text_only";

// ─── Toast ───────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info";
interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

function ToastList({ toasts, remove }: { toasts: Toast[]; remove: (id: string) => void }) {
  const colors: Record<ToastType, string> = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    error: "border-red-500/40 bg-red-500/10 text-red-300",
    info: "border-neutral-700 bg-neutral-900 text-neutral-300",
  };
  const icons: Record<ToastType, React.ReactNode> = {
    success: <Check size={14} className="text-emerald-400 shrink-0" />,
    error: <AlertCircle size={14} className="text-red-400 shrink-0" />,
    info: <Activity size={14} className="text-neutral-400 shrink-0" />,
  };

  return (
    <div className="fixed bottom-5 right-5 left-5 md:left-auto z-50 flex flex-col gap-2 pointer-events-none items-center md:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={`animate-slide-in flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm shadow-xl w-full max-w-xs pointer-events-auto cursor-pointer select-none backdrop-blur-md ${colors[t.type]}`}
        >
          {icons[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-neutral-800/60 animate-pulse ${className}`} />;
}

function formatCooldownRemaining(untilMs: number, reason: "daily" | "minute"): string {
  if (reason === "daily") return "Resets PT midnight";
  const diffSec = Math.max(1, Math.ceil((untilMs - Date.now()) / 1000));
  if (diffSec >= 60) return `${Math.ceil(diffSec / 60)}m left`;
  return `${diffSec}s left`;
}

function formatTokenLimit(tokens: number | null): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return `${tokens} ctx`;
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

// ─── Main Dashboard Component ─────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revivingId, setRevivingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showIntegration, setShowIntegration] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Interactive cross-filtering & view state
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [expandedFallbacks, setExpandedFallbacks] = useState<Record<string, boolean>>({});

  // Model Catalog Filters & Sorting
  const [modelSearch, setModelSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("sequence");

  // Live RPM rolling sparkline across 6s polls
  const [rpmHistory, setRpmHistory] = useState<
    Array<{ time: string; rpm: number; rpd: number }>
  >([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const removeToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  // Fetch dashboard telemetry
  const fetchStats = useCallback(
    async (sess: Session, quiet = false, forceSyncModels = false) => {
      if (!sess) return;
      if (!quiet) setRefreshing(true);

      try {
        const endpoint = forceSyncModels ? "/api/admin/stats?refresh=1" : "/api/admin/stats";
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${sess.access_token}` },
        });

        if (res.ok) {
          const json = (await res.json()) as DashboardPayload;
          setData(json);

          const label = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          setRpmHistory((prev) => [
            ...prev.slice(-19),
            {
              time: label,
              rpm: json.summary.active_rpm,
              rpd: json.summary.today_requests,
            },
          ]);

          if (forceSyncModels) {
            addToast(
              `Synced ${json.models.length} models (${json.catalogMeta.source === "live" ? "live API" : "fallback catalog"})`,
              "success"
            );
          }
        } else if (res.status === 401) {
          await supabaseClient.auth.signOut();
          router.push("/login");
        }
      } catch {
        if (!quiet) addToast("Failed to fetch stats", "error");
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [router, addToast]
  );

  // Auth init
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session: activeSession } }) => {
      if (!activeSession) {
        router.push("/login");
        return;
      }
      setSession(activeSession);
    });
  }, [router]);

  // Initial fetch + 6s auto-refresh
  useEffect(() => {
    if (!session) return;
    fetchStats(session);
    const id = setInterval(() => fetchStats(session, true), 6000);
    return () => clearInterval(id);
  }, [session, fetchStats]);

  // Add API Key
  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !newKeyValue.trim()) return;
    setIsAdding(true);

    const fallbackName = `Key-${(data?.keys.length || 0) + 1}`;
    const finalName = newKeyName.trim() || fallbackName;

    const { error } = await supabaseClient.from("api_keys").insert({
      user_id: session.user.id,
      name: finalName,
      key_value: newKeyValue.trim(),
    });

    if (error) {
      addToast("Failed to add API key: " + error.message, "error");
    } else {
      setNewKeyName("");
      setNewKeyValue("");
      addToast("API key added — syncing live models…", "success");
      await fetchStats(session, false, true);
    }
    setIsAdding(false);
  };

  // Delete API Key cleanly via admin route
  const handleDeleteKey = async (keyId: string) => {
    if (!session) return;
    if (confirmDelete !== keyId) {
      setConfirmDelete(keyId);
      setTimeout(() => setConfirmDelete((id) => (id === keyId ? null : id)), 3000);
      return;
    }

    setDeletingId(keyId);
    setConfirmDelete(null);

    try {
      const res = await fetch(`/api/admin/keys?id=${encodeURIComponent(keyId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        addToast("Failed to remove API key", "error");
      } else {
        if (selectedKeyId === keyId) setSelectedKeyId("");
        addToast("API key removed", "success");
        await fetchStats(session);
      }
    } catch {
      addToast("Failed to remove API key", "error");
    } finally {
      setDeletingId(null);
    }
  };

  // Revive dead key or clear active per-model cooldowns
  const handleReviveKey = async (keyId: string) => {
    if (!session) return;
    setRevivingId(keyId);
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "revive", keyId }),
      });
      if (res.ok) {
        addToast("Key status & cooldowns reset", "success");
        await fetchStats(session);
      } else {
        addToast("Could not reset key status", "error");
      }
    } catch {
      addToast("Could not reset key status", "error");
    } finally {
      setRevivingId(null);
    }
  };

  const handleClearAllCooldowns = async () => {
    if (!session) return;
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "clear_cooldowns" }),
      });
      if (res.ok) {
        addToast("Cleared all active model cooldowns", "success");
        await fetchStats(session);
      }
    } catch {
      addToast("Failed to clear cooldowns", "error");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(text);
    addToast("Copied to clipboard", "success");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    router.push("/login");
  };

  const toggleExpandKey = (keyId: string) => {
    setExpandedKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const toggleExpandFallback = (modelId: string) => {
    setExpandedFallbacks((prev) => ({ ...prev, [modelId]: !prev[modelId] }));
  };

  // ── Derived Telemetry Lookups ──────────────────────────────────────────────

  const keyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of data?.keys || []) map.set(k.id, k.name || "Key");
    return map;
  }, [data]);

  const modelNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of data?.models || []) map.set(m.id, m.name);
    return map;
  }, [data]);

  // Usage grouped per API key
  const usageByKey = useMemo(() => {
    const map = new Map<string, DashboardUsageItem[]>();
    for (const u of data?.usage || []) {
      const list = map.get(u.api_key_id) || [];
      list.push(u);
      map.set(u.api_key_id, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) =>
        b.rpd_count !== a.rpd_count ? b.rpd_count - a.rpd_count : b.rpm_count - a.rpm_count
      );
      map.set(k, list);
    }
    return map;
  }, [data]);

  // Usage grouped per model (filtered by selectedKeyId if active)
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
      entry.perKey.sort((a, b) => b.rpd - a.rpd);
    }

    return map;
  }, [data, selectedKeyId, keyNameMap]);

  // Cooldowns grouped per model
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

  // Category pill counts across discovered models
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

  // Filtered & sorted models for Catalog table/cards
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

      // Default "sequence": Flash -> Flash-Lite -> Pro/4 -> Gemma -> Image -> TTS -> Live -> Media -> Embedding -> Agents
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

  // ── Loading Skeleton ───────────────────────────────────────────────────────

  if (!data) {
    return (
      <div className="min-h-screen bg-[#030303] text-neutral-300 p-4 md:p-8 max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-7 h-7 rounded-lg" />
            <Skeleton className="w-40 h-6" />
          </div>
          <Skeleton className="w-28 h-8 rounded-lg" />
        </div>
        <Skeleton className="w-full h-20 rounded-2xl mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-12 gap-5 mb-8">
          <Skeleton className="lg:col-span-7 h-80 rounded-2xl" />
          <Skeleton className="lg:col-span-5 h-80 rounded-2xl" />
        </div>
        <Skeleton className="w-full h-64 rounded-2xl" />
      </div>
    );
  }

  // ── Derived Summary Values ─────────────────────────────────────────────────

  const proxyBaseUrl = `https://${typeof window !== "undefined" ? window.location.host : "gemprism.vercel.app"}/api/proxy`;

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#030303] bg-dots text-neutral-300 p-4 md:p-8 max-w-7xl mx-auto selection:bg-emerald-500/25">
      <ToastList toasts={toasts} remove={removeToast} />

      {/* ── Top Command Header ── */}
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 text-white font-semibold text-lg shrink-0">
            <LogoLayeredCore className="text-emerald-500" size={22} />
            <span>GemPrism</span>
          </Link>

          <span className="hidden sm:inline text-neutral-700">/</span>

          <span className="hidden sm:inline text-neutral-400 text-sm truncate max-w-[200px]">
            {session?.user?.email}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border shrink-0 ${
              data.catalogMeta.source === "live"
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                : "bg-neutral-900 border-neutral-800 text-neutral-400"
            }`}
          >
            <Sparkles size={11} />
            {data.catalogMeta.source === "live"
              ? `Live · ${data.catalogMeta.count} models`
              : `Seed · ${data.catalogMeta.count} models`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {data.cooldowns.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllCooldowns}
              className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
              title="Clear all active per-model 429 cooldowns"
            >
              <RotateCw size={13} />
              <span className="hidden sm:inline">Clear {data.cooldowns.length} Cooldowns</span>
              <span className="sm:hidden">{data.cooldowns.length}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => session && fetchStats(session, false, true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-neutral-300 hover:text-white bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            title="Sync live models from Gemini API & refresh metrics"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-emerald-400" : ""} />
            <span className="hidden sm:inline">Sync & Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-neutral-400 hover:text-white bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Compact Gateway Token & Integration Bar ── */}
      <div className="mb-8 bg-[#0a0a0a] border border-emerald-500/20 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-w-0">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Gateway Endpoint & Token
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Drop-in replacement for Google GenAI SDK — automatic failover across keys and models.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy(data.token)}
              className="flex items-center gap-2 bg-[#0f0f0f] border border-neutral-800 hover:border-emerald-500/40 px-3 py-2 rounded-xl text-xs transition-all group max-w-full"
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
              className="flex items-center gap-2 bg-[#0f0f0f] border border-neutral-800 hover:border-cyan-500/40 px-3 py-2 rounded-xl text-xs transition-all group"
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
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
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
          <div className="mt-4 pt-4 border-t border-neutral-800/80 animate-fade-in">
            <CodeBlock code={integrationCode} />
          </div>
        )}
      </div>

      {/* ── 5 KPI Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-9">
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
            <span className="text-[11px] text-neutral-500">
              {data.summary.total_errors} err
            </span>
          </div>
        </div>
      </div>

      {/* ── Interactive Analytics Graphs ── */}
      <AnalyticsCharts
        keys={data.keys}
        models={data.models}
        usage={data.usage}
        cooldowns={data.cooldowns}
        rpmHistory={rpmHistory}
        selectedKeyId={selectedKeyId}
        onSelectKey={setSelectedKeyId}
        selectedModelId={selectedModelId}
        onSelectModel={setSelectedModelId}
      />

      {/* ── API Keys Pool + Per-Key Model Breakdown ── */}
      <section className="mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 px-1">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <KeyRound size={18} className="text-emerald-400" />
              API Keys Pool
              <span className="text-neutral-400 font-normal text-xs bg-neutral-900 border border-neutral-800 px-2.5 py-0.5 rounded-full">
                {data.keys.length}
              </span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Expand any key to see exact per-model request counts and active cooldown timers.
            </p>
          </div>
        </div>

        {/* Add Key Form */}
        <form
          onSubmit={handleAddKey}
          className="flex flex-col sm:flex-row gap-2.5 mb-5 bg-[#0a0a0a] p-3 sm:p-4 rounded-2xl border border-neutral-800"
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
                  className={`bg-[#0a0a0a] border rounded-2xl transition-all shadow-lg overflow-hidden ${
                    isSelected ? "border-emerald-500/40" : "border-neutral-800"
                  }`}
                >
                  {/* Primary Key Summary Row */}
                  <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center justify-between gap-3 min-w-0">
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
                    </div>

                    {/* Key Metrics + Actions */}
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
                            onClick={() => handleReviveKey(k.id)}
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
                          onClick={() => handleDeleteKey(k.id)}
                          disabled={deletingId === k.id}
                          className={`text-xs flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-all font-medium disabled:opacity-40 ${
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

                  {/* Quick Inline Chips Preview (collapsed) */}
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
                          <span className="font-[family-name:var(--font-mono)]">
                            {u.model_name}
                          </span>
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
                          <span className="font-[family-name:var(--font-mono)]">
                            {cd.model_name}
                          </span>
                          <span className="opacity-80">
                            ({formatCooldownRemaining(cd.until, cd.reason)})
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expanded Per-Key Model Breakdown Drawer */}
                  {isExpanded && (
                    <div className="border-t border-neutral-800/80 bg-[#070707] p-4 sm:p-5 space-y-4 animate-fade-in">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                          Models Served by {k.name}
                        </h4>
                        <span className="text-[11px] text-neutral-500">
                          Counts reflect fulfilled requests (no static upper limits)
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
                                      {formatCooldownRemaining(cd.until, cd.reason)}
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
                                  {cd.model_name} · {formatCooldownRemaining(cd.until, cd.reason)}
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

      {/* ── Live Model Catalog & Telemetry Sequence ── */}
      <section className="mb-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5 px-1">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
              <Database size={18} className="text-emerald-400" />
              Live Model Catalog & Routing Sequence
            </h2>
            <p className="text-xs text-neutral-500">
              Automatically synced from Google Gemini API — organized by Flash, Flash-Lite, Pro & Frontier, Gemma, and specialized modalities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Key Filter */}
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

            {/* Sort Selector */}
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
        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-4 mb-4 space-y-3">
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

          {/* Category Filter Pills */}
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
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-[#0d0d0d] border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider font-semibold">
                      <th className="px-5 py-3.5 font-normal">Model & Family</th>
                      <th className="px-5 py-3.5 font-normal">API Identifier</th>
                      <th className="px-5 py-3.5 font-normal text-right">Today</th>
                      <th className="px-5 py-3.5 font-normal text-right">Live RPM</th>
                      <th className="px-5 py-3.5 font-normal">Serving Keys & Failover</th>
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

      {/* ── Footer ── */}
      <footer className="mt-10 pt-6 border-t border-neutral-800/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Auto-refreshes metrics every 6 seconds · Live Gemini model discovery enabled
        </span>
        <span className="font-medium flex items-center gap-1">
          GemPrism command center
          <TrendingUp size={12} className="opacity-50" />
        </span>
      </footer>
    </div>
  );
}