"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabase";
import {
  Activity, ShieldAlert, Zap, ServerCrash, Copy, Check,
  Database, Plus, LogOut, Trash2, RefreshCw, AlertCircle,
  ChevronUp, KeyRound, TrendingUp, Code as CodeIcon, ChevronDown
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { LogoLayeredCore } from "@/components/Logo";

// ─── Toast ───────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info";
interface Toast { id: string; message: string; type: ToastType }

function ToastList({ toasts, remove }: { toasts: Toast[]; remove: (id: string) => void }) {
  const colors: Record<ToastType, string> = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    error:   "border-red-500/40    bg-red-500/10    text-red-300",
    info:    "border-neutral-700   bg-neutral-900   text-neutral-300",
  };
  const icons: Record<ToastType, React.ReactNode> = {
    success: <Check size={14} className="text-emerald-400 shrink-0" />,
    error:   <AlertCircle size={14} className="text-red-400 shrink-0" />,
    info:    <Activity size={14} className="text-neutral-400 shrink-0" />,
  };

  return (
    <div className="fixed bottom-5 right-5 left-5 md:left-auto z-50 flex flex-col gap-2 pointer-events-none items-center md:items-end">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={`animate-slide-in flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm shadow-xl w-full max-w-xs pointer-events-auto cursor-pointer select-none ${colors[t.type]}`}
        >
          {icons[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-neutral-800/60 animate-pulse ${className}`} />;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function UsageBar({ value, max, label }: { value: number; max: number; label: string }) {
  const isUnlimited  = max === 999_999;
  const isWaitlisted = max === 0;

  let pct   = 0;
  let color = "bg-emerald-500";

  if (isWaitlisted) {
    pct   = 0;
    color = "bg-red-500/50";
  } else if (isUnlimited) {
    pct   = 0;
    color = "bg-cyan-500";
  } else {
    pct   = Math.min(100, Math.round((value / max) * 100));
    color = pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-400" : "bg-emerald-500";
  }

  const displayMax = isWaitlisted ? "0" : isUnlimited ? "∞" : max.toLocaleString();

  return (
    <div className="w-full min-w-[120px]">
      <div className="flex justify-between text-xs mb-1.5 font-medium">
        <span className="text-neutral-500">{label}</span>
        <span className="text-neutral-300">
          <span className={pct > 0 && !isWaitlisted ? "text-emerald-400" : ""}>
            {value.toLocaleString()}
          </span>
          <span className="text-neutral-600 mx-0.5">/</span>
          {isUnlimited
            ? <span className="text-cyan-400">{displayMax}</span>
            : displayMax}
        </span>
      </div>
      <div className="h-1.5 bg-neutral-900 border border-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; dot: string }> = {
    healthy: { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500" },
    cooling: { cls: "bg-amber-500/10  text-amber-400  border-amber-500/20",     dot: "bg-amber-400"  },
    dead:    { cls: "bg-red-500/10    text-red-400    border-red-500/20",        dot: "bg-red-500"    },
  };
  const s = map[status] ?? map.dead;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] sm:text-xs font-semibold tracking-wide uppercase ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "healthy" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();

  const [data,          setData         ] = useState<any>(null);
  const [session,       setSession      ] = useState<any>(null);
  const [copiedId,      setCopiedId     ] = useState<string | null>(null);
  const [newKeyName,    setNewKeyName   ] = useState("");
  const [newKeyValue,   setNewKeyValue  ] = useState("");
  const [isAdding,      setIsAdding     ] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deletingId,    setDeletingId   ] = useState<string | null>(null);
  const [refreshing,    setRefreshing   ] = useState(false);
  const [toasts,        setToasts       ] = useState<Toast[]>([]);
  const [activeKeyId,   setActiveKeyId  ] = useState<string>("");

  // ── Toast helpers ──────────────────────────────────────────────────────────

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  },[]);

  const removeToast = useCallback((id: string) =>
    setToasts(prev => prev.filter(t => t.id !== id)),[]);

  // ── Generate a random default key name on mount ────────────────────────────

  useEffect(() => {
    setNewKeyName(`Key-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  },[]);

  // ── Fetch dashboard stats ──────────────────────────────────────────────────

  const fetchStats = useCallback(async (sess: any, quiet = false) => {
    if (!sess) return;
    if (!quiet) setRefreshing(true);

    try {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${sess.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setData(json);

        if (json.keys?.length > 0) {
          setActiveKeyId(prev =>
            prev && json.keys.some((k: any) => k.id === prev) ? prev : json.keys[0].id
          );
        } else {
          setActiveKeyId("");
        }
      } else if (res.status === 401) {
        await supabaseClient.auth.signOut();
        router.push("/login");
      }
    } catch {
      addToast("Failed to fetch stats", "error");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, [router, addToast]);

  // ── Auth init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setSession(session);
    });
  }, [router]);

  // ── Auto-refresh every 6 seconds ──────────────────────────────────────────

  useEffect(() => {
    if (!session) return;
    fetchStats(session);
    const id = setInterval(() => fetchStats(session, true), 6000);
    return () => clearInterval(id);
  }, [session, fetchStats]);

  // ── Add key ────────────────────────────────────────────────────────────────

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyValue.trim() || !newKeyName.trim()) return;
    setIsAdding(true);

    const { error } = await supabaseClient.from("api_keys").insert({
      user_id:   session.user.id,
      name:      newKeyName.trim(),
      key_value: newKeyValue.trim(),
    });

    if (error) {
      addToast("Failed to add API key: " + error.message, "error");
    } else {
      setNewKeyName(`Key-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
      setNewKeyValue("");
      addToast("API key added successfully", "success");
      await fetchStats(session);
    }
    setIsAdding(false);
  };

  // ── Delete key ─────────────────────────────────────────────────────────────

  const handleDeleteKey = async (keyId: string) => {
    if (confirmDelete !== keyId) {
      setConfirmDelete(keyId);
      setTimeout(() => setConfirmDelete(id => (id === keyId ? null : id)), 3000);
      return;
    }

    setDeletingId(keyId);
    setConfirmDelete(null);

    const { error } = await supabaseClient.from("api_keys").delete().eq("id", keyId);
    if (error) {
      addToast("Failed to remove API key", "error");
    } else {
      addToast("API key removed", "success");
      await fetchStats(session);
    }
    setDeletingId(null);
  };

  // ── Copy to clipboard ──────────────────────────────────────────────────────

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(text);
    addToast("Copied to clipboard", "success");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Sign out ───────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    router.push("/login");
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (!data) {
    return (
      <div className="min-h-screen bg-[#030303] text-neutral-300 p-4 md:p-8 max-w-7xl mx-auto">
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-6 h-6" />
            <Skeleton className="w-40 h-6" />
          </div>
          <Skeleton className="w-24 h-8 rounded-lg" />
        </div>
        <Skeleton className="w-full h-24 rounded-2xl mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="w-full h-12 rounded-xl mb-10" />
        <Skeleton className="w-full h-64 rounded-xl mb-10" />
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const STATS =[
    { label: "Total Requests", value: data.summary.total_requests, icon: Activity,    color: "text-emerald-400" },
    { label: "Active Keys",    value: data.summary.active,         icon: Zap,         color: "text-emerald-400" },
    { label: "Cooling Keys",   value: data.summary.cooling,        icon: ShieldAlert, color: "text-amber-400"   },
    { label: "Dead Keys",      value: data.summary.dead,           icon: ServerCrash, color: "text-red-400"     },
  ];

  const getUsageForActiveKey = (modelName: string) => {
    if (!activeKeyId) return { rpm: 0, rpd: 0 };

    const now      = Date.now();
    const todayStr = new Date().toISOString().split('T')[0];

    const record = data.usage.find(
      (u: any) => u.api_key_id === activeKeyId && u.model_name === modelName
    );
    if (!record) return { rpm: 0, rpd: 0 };

    const rpd = record.rpd_date === todayStr ? (record.rpd_count || 0) : 0;
    const rpm = (now - (record.rpm_window_start || 0)) <= 60_000 ? (record.rpm_count || 0) : 0;

    return { rpm, rpd };
  };

  const getKeyTotals = (keyId: string): { rpd: number; rpm: number } => {
    const now      = Date.now();
    const todayStr = new Date().toISOString().split('T')[0];

    const keyUsages = (data.usage ||[]).filter((u: any) => u.api_key_id === keyId);

    return keyUsages.reduce(
      (acc: { rpd: number; rpm: number }, u: any) => {
        const rpd = u.rpd_date === todayStr ? (u.rpd_count || 0) : 0;
        const rpm = (now - (u.rpm_window_start || 0)) <= 60_000 ? (u.rpm_count || 0) : 0;
        return { rpd: acc.rpd + rpd, rpm: acc.rpm + rpm };
      },
      { rpd: 0, rpm: 0 }
    );
  };

  // Dynamically sort models for the table based on availability and usage volume
  const sortedModels = Object.entries(data.models)
    .filter(([id]) => id !== "default")
    .map(([id, details]: [string, any]) => {
      const usage = getUsageForActiveKey(id);
      const isWaitlisted = details.rpd === 0;
      return { id, details, usage, isWaitlisted };
    })
    .sort((a, b) => {
      // 1. Available models above waitlisted
      if (a.isWaitlisted && !b.isWaitlisted) return 1;
      if (!a.isWaitlisted && b.isWaitlisted) return -1;
      
      // 2. Highest daily requests first
      if (b.usage.rpd !== a.usage.rpd) return b.usage.rpd - a.usage.rpd;
      
      // 3. Highest requests per minute first
      if (b.usage.rpm !== a.usage.rpm) return b.usage.rpm - a.usage.rpm;
      
      // 4. Alphabetical fallback
      return a.details.name.localeCompare(b.details.name);
    });

  // Dynamically build the SDK code with the user's specific access token
  const integrationCode = `import { GoogleGenAI } from "@google/genai";

// ① Use your GemPrism Gateway Token as the API key
// ② Point baseUrl at your GemPrism instance
const ai = new GoogleGenAI({
  apiKey: "${data.token}",
  baseUrl: "https://${typeof window !== "undefined" ? window.location.host : "gemprism.vercel.app"}/api/proxy",
});

// No other changes needed — full SDK compatibility
const response = await ai.models.generateContent({
  model: "gemini-pro-latest",
  contents: "Explain quantum entanglement in one sentence.",
});

console.log(response.text);`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#030303] bg-dots text-neutral-300 p-4 md:p-8 max-w-7xl mx-auto selection:bg-emerald-500/25">
      <ToastList toasts={toasts} remove={removeToast} />

      {/* ── Header ── */}
      <header className="mb-8 md:mb-10 flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 text-white font-semibold text-lg">
          <LogoLayeredCore className="text-emerald-500" size={22} />
          <span>GemPrism</span> {/* Retained on Mobile */}
          <span className="hidden sm:inline text-neutral-600 font-normal text-sm">/</span>
          {/* Email dynamically hidden on mobile */}
          <span className="hidden sm:inline text-neutral-400 text-sm font-normal truncate max-w-[150px] sm:max-w-none">
            {session?.user?.email}
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => fetchStats(session)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors text-sm disabled:opacity-50 px-2 py-1"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors text-sm px-2 py-1"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Gateway Token & Integration Section ── */}
      <div className="mb-8">
        <div className="bg-[#0a0a0a] border border-emerald-500/20 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div>
            <h3 className="text-emerald-400 font-semibold text-base mb-1">Your Gateway Token</h3>
            <p className="text-neutral-500 text-xs sm:text-sm">
              Use this as your API key in the Google GenAI SDK.
            </p>
          </div>
          <button
            onClick={() => handleCopy(data.token)}
            className="flex items-center gap-2.5 bg-[#0f0f0f] border border-neutral-800 hover:border-emerald-500/40 px-4 py-3 rounded-xl text-white text-sm transition-all group w-full sm:w-auto justify-between"
          >
            <code className="text-emerald-300 font-[family-name:var(--font-mono)] text-xs sm:text-sm truncate w-full sm:max-w-[280px]">
              {data.token}
            </code>
            {copiedId === data.token
              ? <Check size={16} className="text-emerald-400 shrink-0" />
              : <Copy size={16} className="text-neutral-500 group-hover:text-white shrink-0 transition-colors" />}
          </button>
        </div>

        {/* Dynamic Integration Snippet */}
        <div className="mt-4">
          <details className="group bg-[#0a0a0a] border border-neutral-800 rounded-2xl overflow-hidden shadow-lg transition-all open:ring-1 open:ring-emerald-500/20">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-[#0d0d0d] transition-colors">
              <div className="flex items-center gap-2.5">
                <CodeIcon size={18} className="text-emerald-400" />
                <span className="font-semibold text-sm text-white">Show Integration Code</span>
              </div>
              <ChevronDown size={18} className="text-neutral-500 group-open:rotate-180 transition-transform duration-300" />
            </summary>
            <div className="p-4 sm:p-6 border-t border-neutral-800 bg-[#050505]">
              <CodeBlock code={integrationCode} />
            </div>
          </details>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-10">
        {STATS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-4 sm:p-5 flex flex-col gap-3 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 text-[11px] sm:text-xs font-medium uppercase tracking-wider">
                {label}
              </span>
              <Icon size={16} className={color} />
            </div>
            <div
              className="text-2xl sm:text-3xl font-semibold text-white"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Add Key Form ── */}
      <form
        onSubmit={handleAddKey}
        className="flex flex-col sm:flex-row gap-2.5 mb-12 bg-[#0a0a0a] p-3 sm:p-4 rounded-2xl border border-neutral-800"
      >
        <input
          type="text"
          placeholder="Key Name"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          className="w-full sm:w-1/4 bg-[#0d0d0d] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3 outline-none transition-colors text-sm font-medium"
          required
        />
        <input
          type="text"
          placeholder="Paste a Google Gemini API Key (AIzaSy…)"
          value={newKeyValue}
          onChange={e => setNewKeyValue(e.target.value)}
          className="w-full flex-1 bg-[#0d0d0d] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3 outline-none transition-colors text-sm font-[family-name:var(--font-mono)]"
          required
        />
        <button
          type="submit"
          disabled={isAdding}
          className="w-full sm:w-auto bg-white hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-60 text-black px-6 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors shrink-0"
        >
          <Plus size={16} />
          {isAdding ? "Adding…" : "Add Key"}
        </button>
      </form>

      {/* ── API Keys Pool ── */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <KeyRound size={18} className="text-neutral-500" />
            API Keys Pool
            <span className="text-neutral-600 font-normal text-sm bg-neutral-900 px-2 py-0.5 rounded-full">
              {data.keys.length}
            </span>
          </h2>
        </div>

        {data.keys.length === 0 ? (
          <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl flex flex-col items-center justify-center py-16 gap-3 text-neutral-600 shadow-xl">
            <KeyRound size={36} className="opacity-30 mb-2" />
            <p className="text-sm font-medium text-neutral-400">No keys added yet.</p>
            <p className="text-xs text-neutral-500 max-w-xs text-center">
              Paste a Gemini API key above to start load-balancing requests.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-[#0a0a0a] border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[#0d0d0d] border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="px-5 py-4 font-normal">Name & Key</th>
                    <th className="px-5 py-4 font-normal">Status</th>
                    <th className="px-5 py-4 font-normal text-center">RPD today</th>
                    <th className="px-5 py-4 font-normal text-center">RPM now</th>
                    <th className="px-5 py-4 font-normal text-right">All-time</th>
                    <th className="px-5 py-4 font-normal text-right">Errors</th>
                    <th className="px-5 py-4 font-normal text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {data.keys.map((k: any) => {
                    const totals = getKeyTotals(k.id);
                    return (
                      <tr key={k.id} className="hover:bg-[#0d0d0d] transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium text-white mb-1">{k.name}</div>
                          <code className="text-neutral-500 text-xs font-[family-name:var(--font-mono)]">
                            {k.key_value}
                          </code>
                        </td>

                        <td className="px-5 py-4">
                          <StatusBadge status={k.status} />
                        </td>

                        <td className="px-5 py-4 text-center">
                          <span className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${totals.rpd > 0 ? "text-emerald-400" : "text-neutral-600"}`}>
                            {totals.rpd.toLocaleString()}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-center">
                          <span className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${totals.rpm > 0 ? "text-cyan-400" : "text-neutral-600"}`}>
                            {totals.rpm.toLocaleString()}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span className="text-neutral-300 font-[family-name:var(--font-mono)] font-semibold text-sm">
                            {(k.total_requests || 0).toLocaleString()}
                          </span>
                          <span className="text-neutral-600 text-xs ml-1.5 block">requests</span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          {k.total_errors > 0 ? (
                            <span
                              className="text-red-400 text-xs font-medium cursor-help border-b border-dashed border-red-400/30 pb-0.5"
                              title={k.last_error ?? "Unknown error"}
                            >
                              {k.total_errors} {k.total_errors === 1 ? "error" : "errors"}
                            </span>
                          ) : (
                            <span className="text-neutral-700 text-xs">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <button
                            onClick={() => handleDeleteKey(k.id)}
                            disabled={deletingId === k.id}
                            className={`text-xs flex items-center justify-center gap-1.5 mx-auto px-3 py-2 rounded-lg transition-all font-medium disabled:opacity-40 w-[100px] ${
                              confirmDelete === k.id
                                ? "bg-red-500/15 border border-red-500/30 text-red-400 animate-glow"
                                : "bg-neutral-900 hover:bg-red-500/10 text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-500/30"
                            }`}
                          >
                            {deletingId === k.id
                              ? <span className="w-3.5 h-3.5 rounded-full border border-neutral-600 border-t-white animate-spin" />
                              : <Trash2 size={14} />}
                            {confirmDelete === k.id ? "Confirm" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col gap-3">
              {data.keys.map((k: any) => {
                const totals = getKeyTotals(k.id);
                return (
                  <div key={k.id} className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-white mb-0.5 text-base">{k.name}</div>
                        <code className="text-neutral-500 text-[11px] font-[family-name:var(--font-mono)]">
                          {k.key_value}
                        </code>
                      </div>
                      <StatusBadge status={k.status} />
                    </div>

                    <div className="grid grid-cols-4 gap-2 bg-[#0d0d0d] p-3 rounded-lg border border-neutral-800/50">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${totals.rpd > 0 ? "text-emerald-400" : "text-neutral-600"}`}>
                          {totals.rpd.toLocaleString()}
                        </span>
                        <span className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">
                          RPD
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${totals.rpm > 0 ? "text-cyan-400" : "text-neutral-600"}`}>
                          {totals.rpm.toLocaleString()}
                        </span>
                        <span className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">
                          RPM
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-[family-name:var(--font-mono)] font-semibold text-sm text-neutral-300 tabular-nums">
                          {(k.total_requests || 0).toLocaleString()}
                        </span>
                        <span className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">
                          Total
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-[family-name:var(--font-mono)] font-semibold text-sm tabular-nums ${k.total_errors > 0 ? "text-red-400" : "text-neutral-600"}`}>
                          {(k.total_errors || 0).toLocaleString()}
                        </span>
                        <span className="text-[9px] text-neutral-600 uppercase tracking-wider font-medium">
                          Errors
                        </span>
                      </div>
                    </div>

                    {k.last_error && k.total_errors > 0 && (
                      <p className="text-[11px] text-red-400/70 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2 leading-relaxed">
                        Last error: {k.last_error}
                      </p>
                    )}

                    <button
                      onClick={() => handleDeleteKey(k.id)}
                      disabled={deletingId === k.id}
                      className={`text-xs flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg transition-all font-medium disabled:opacity-40 ${
                        confirmDelete === k.id
                          ? "bg-red-500/15 border border-red-500/30 text-red-400"
                          : "bg-neutral-900/50 hover:bg-red-500/10 text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-500/30"
                      }`}
                    >
                      {deletingId === k.id
                        ? <span className="w-3.5 h-3.5 rounded-full border border-neutral-600 border-t-white animate-spin" />
                        : <Trash2 size={14} />}
                      {confirmDelete === k.id ? "Confirm Removal" : "Remove API Key"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Model Telemetry ── */}
      <div className="mb-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5 px-1">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
              <Database size={18} className="text-neutral-500" />
              Model Registry & Exact Limits
            </h2>
            <p className="text-xs text-neutral-500">
              Track precise rate limit consumption across the active API key.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 w-full md:w-auto">
            <label className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
              Track specific key
            </label>
            <div className="relative">
              <select
                value={activeKeyId}
                onChange={e => setActiveKeyId(e.target.value)}
                className="w-full md:w-64 bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 focus:border-emerald-500 text-white rounded-xl pl-4 pr-10 py-2.5 outline-none transition-colors text-sm appearance-none cursor-pointer"
              >
                {data.keys.length === 0 && <option value="">No keys available</option>}
                {data.keys.map((k: any) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                <ChevronUp size={14} className="rotate-180" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-[#0d0d0d] border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-5 py-4 font-normal">Model</th>
                  <th className="px-5 py-4 font-normal">API Identifier</th>
                  <th className="px-5 py-4 font-normal">Requests / Min</th>
                  <th className="px-5 py-4 font-normal">Requests / Day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {sortedModels.map(({ id, details, usage, isWaitlisted }) => (
                  <tr
                    key={id}
                    className={`hover:bg-[#0d0d0d] transition-colors ${isWaitlisted ? "opacity-50 grayscale" : ""}`}
                  >
                    <td className="px-5 py-4 font-medium text-white text-sm whitespace-nowrap">
                      {details.name}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleCopy(id)}
                        className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white text-xs transition-colors font-[family-name:var(--font-mono)]"
                        title="Copy API identifier"
                      >
                        {id}
                        {copiedId === id
                          ? <Check size={12} className="text-emerald-400 shrink-0" />
                          : <Copy size={12} className="shrink-0" />}
                      </button>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <UsageBar value={usage.rpm} max={details.rpm} label="RPM" />
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <UsageBar value={usage.rpd} max={details.rpd} label="RPD" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View for Models */}
          <div className="md:hidden flex flex-col divide-y divide-neutral-800/60">
            {sortedModels.map(({ id, details, usage, isWaitlisted }) => (
              <div
                key={id}
                className={`p-4 flex flex-col gap-4 ${isWaitlisted ? "opacity-50 grayscale" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">{details.name}</span>
                  <button
                    onClick={() => handleCopy(id)}
                    className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-md text-neutral-400 text-[10px] font-[family-name:var(--font-mono)]"
                  >
                    {id}{" "}
                    {copiedId === id
                      ? <Check size={10} className="text-emerald-400" />
                      : <Copy size={10} />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 bg-[#0d0d0d] p-3 rounded-xl border border-neutral-800/50">
                  <UsageBar value={usage.rpm} max={details.rpm} label="REQ / MIN" />
                  <UsageBar value={usage.rpd} max={details.rpd} label="REQ / DAY" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="mt-10 pt-6 border-t border-neutral-800/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Auto-refreshes metrics every 6 seconds
        </span>
        <span className="font-medium flex items-center gap-1">
          GemPrism dashboard
          <TrendingUp size={12} className="opacity-50" />
        </span>
      </div>
    </div>
  );
}