"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabase";
import {
  Activity, ShieldAlert, Zap, ServerCrash, Copy, Check,
  Database, Plus, LogOut, Trash2, RefreshCw, AlertCircle,
  ChevronUp, Layers,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ─── Toast ─── */
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
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={`animate-slide-in flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm shadow-xl max-w-xs pointer-events-auto cursor-pointer select-none ${colors[t.type]}`}
        >
          {icons[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Skeleton Card ─── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-neutral-800/60 animate-pulse ${className}`} />;
}

/* ─── Progress Bar ─── */
function UsageBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color =
    pct >= 90 ? "bg-red-500" :
    pct >= 60 ? "bg-amber-400" :
    "bg-emerald-500";

  return (
    <div className="w-full min-w-[90px]">
      <div className="flex justify-between text-xs text-neutral-500 mb-1">
        <span>{label}</span>
        <span className="text-neutral-400">{value}/{max === 999999 ? "∞" : max}</span>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; dot: string }> = {
    healthy: { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500" },
    cooling: { cls: "bg-amber-500/10  text-amber-400  border-amber-500/20",  dot: "bg-amber-400" },
    dead:    { cls: "bg-red-500/10    text-red-400    border-red-500/20",    dot: "bg-red-500" },
  };
  const s = map[status] ?? map.dead;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold tracking-wide ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "healthy" ? "animate-pulse" : ""}`} />
      {status.toUpperCase()}
    </span>
  );
}

/* ─── Main Component ─── */
export default function Dashboard() {
  const router = useRouter();
  const [data,           setData          ] = useState<any>(null);
  const [session,        setSession       ] = useState<any>(null);
  const [copiedId,       setCopiedId      ] = useState<string | null>(null);
  const [newKey,         setNewKey        ] = useState("");
  const [isAdding,       setIsAdding      ] = useState(false);
  const [confirmDelete,  setConfirmDelete ] = useState<string | null>(null);
  const [deletingId,     setDeletingId    ] = useState<string | null>(null);
  const [refreshing,     setRefreshing    ] = useState(false);
  const [toasts,         setToasts        ] = useState<Toast[]>([]);

  /* ── Toast helpers ── */
  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /* ── Fetch stats ── */
  const fetchStats = useCallback(async (sess: any, quiet = false) => {
    if (!sess) return;
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${sess.access_token}` },
      });
      if (res.ok) {
        setData(await res.json());
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

  /* ── Auth init ── */
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setSession(session);
    });
  }, [router]);

  /* ── Auto-refresh ── */
  useEffect(() => {
    if (!session) return;
    fetchStats(session);
    const id = setInterval(() => fetchStats(session, true), 6000);
    return () => clearInterval(id);
  }, [session, fetchStats]);

  /* ── Add key ── */
  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setIsAdding(true);

    const { error } = await supabaseClient.from("api_keys").insert({
      user_id: session.user.id,
      key_value: newKey.trim(),
    });

    if (error) {
      addToast("Failed to add node: " + error.message, "error");
    } else {
      setNewKey("");
      addToast("Node added successfully", "success");
      await fetchStats(session);
    }
    setIsAdding(false);
  };

  /* ── Delete key (two-click confirmation) ── */
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
      addToast("Failed to remove node", "error");
    } else {
      addToast("Node removed", "success");
      await fetchStats(session);
    }
    setDeletingId(null);
  };

  /* ── Copy helper ── */
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(text);
    addToast("Copied to clipboard", "success");
    setTimeout(() => setCopiedId(null), 2000);
  };

  /* ── Sign out ── */
  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    router.push("/login");
  };

  /* ── Loading skeleton ── */
  if (!data) {
    return (
      <div className="min-h-screen bg-[#030303] text-neutral-300 p-4 md:p-8 max-w-7xl mx-auto">
        {/* header skeleton */}
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-6 h-6" />
            <Skeleton className="w-40 h-6" />
          </div>
          <Skeleton className="w-24 h-8 rounded-lg" />
        </div>
        {/* token banner */}
        <Skeleton className="w-full h-24 rounded-2xl mb-8" />
        {/* stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="w-full h-12 rounded-xl mb-10" />
        <Skeleton className="w-full h-64 rounded-xl mb-10" />
        <Skeleton className="w-full h-80 rounded-xl" />
      </div>
    );
  }

  const STATS = [
    { label: "Daily Requests",  value: data.summary.total_requests, icon: Activity,    color: "text-emerald-400" },
    { label: "Active Nodes",    value: data.summary.active,         icon: Zap,         color: "text-emerald-400" },
    { label: "Cooling Nodes",   value: data.summary.cooling,        icon: ShieldAlert, color: "text-amber-400"   },
    { label: "Dead Nodes",      value: data.summary.dead,           icon: ServerCrash, color: "text-red-400"     },
  ];

  return (
    <div className="min-h-screen bg-[#030303] bg-dots text-neutral-300 p-4 md:p-8 max-w-7xl mx-auto selection:bg-emerald-500/25">

      {/* ── Toasts ── */}
      <ToastList toasts={toasts} remove={removeToast} />

      {/* ── Header ── */}
      <header className="mb-8 md:mb-10 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 text-white font-semibold text-lg">
          <Layers className="text-emerald-500" size={22} />
          <span className="hidden sm:inline">GemPrism</span>
          <span className="hidden sm:inline text-neutral-600 font-normal text-sm">/</span>
          <span className="text-neutral-400 text-sm font-normal hidden sm:inline">
            {session?.user?.email}
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchStats(session)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors text-sm disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors text-sm"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Gateway Token ── */}
      <div className="bg-[#0a0a0a] border border-emerald-500/20 rounded-2xl p-5 sm:p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-emerald-400 font-semibold text-base mb-0.5">Your Gateway Token</h3>
          <p className="text-neutral-500 text-xs">
            Use this as your API key in the Google GenAI SDK.
          </p>
        </div>
        <button
          onClick={() => handleCopy(data.token)}
          className="flex items-center gap-2.5 bg-[#0f0f0f] border border-neutral-800 hover:border-emerald-500/40 px-4 py-2.5 rounded-xl text-white text-sm transition-all group"
        >
          <code
            className="text-emerald-300 font-[family-name:var(--font-mono)] text-xs sm:text-sm truncate max-w-[180px] sm:max-w-[280px]"
          >
            {data.token}
          </code>
          {copiedId === data.token
            ? <Check size={15} className="text-emerald-400 shrink-0" />
            : <Copy size={15} className="text-neutral-500 group-hover:text-white shrink-0 transition-colors" />}
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        {STATS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 text-xs">{label}</span>
              <Icon size={15} className={color} />
            </div>
            <div className="text-2xl md:text-3xl font-semibold text-white" style={{ fontFamily: "var(--font-mono)" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Add Key Form ── */}
      <form onSubmit={handleAddKey} className="flex flex-col sm:flex-row gap-2.5 mb-10">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Paste a Google Gemini API Key  (AIzaSy…)"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3 outline-none transition-colors text-sm font-[family-name:var(--font-mono)]"
            required
          />
        </div>
        <button
          type="submit"
          disabled={isAdding}
          className="bg-white hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-60 text-black px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors shrink-0"
        >
          <Plus size={16} />
          {isAdding ? "Adding…" : "Add Node"}
        </button>
      </form>

      {/* ── Routing Nodes Table ── */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <ServerCrash size={17} className="text-neutral-500" />
            Routing Nodes
            <span className="text-neutral-600 font-normal text-sm">({data.keys.length})</span>
          </h2>
        </div>

        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl overflow-hidden">
          {data.keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-600">
              <ServerCrash size={36} className="opacity-30" />
              <p className="text-sm">No nodes added yet.</p>
              <p className="text-xs text-neutral-700">Paste a Gemini API key above to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-[#0d0d0d] border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3.5 font-normal">Key</th>
                    <th className="px-5 py-3.5 font-normal">Status</th>
                    <th className="px-5 py-3.5 font-normal">RPM Usage</th>
                    <th className="px-5 py-3.5 font-normal">RPD Usage</th>
                    <th className="px-5 py-3.5 font-normal">Errors</th>
                    <th className="px-5 py-3.5 font-normal text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.keys.map((k: any) => (
                    <tr
                      key={k.id}
                      className="border-b border-neutral-800/60 hover:bg-[#0d0d0d] transition-colors"
                    >
                      <td className="px-5 py-4">
                        <code className="text-neutral-400 text-xs font-[family-name:var(--font-mono)]">
                          {k.key_value}
                        </code>
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={k.status} />
                      </td>

                      <td className="px-5 py-4 min-w-[140px]">
                        <UsageBar value={k.rpm_count} max={15} label="req/min" />
                      </td>

                      <td className="px-5 py-4 min-w-[140px]">
                        <UsageBar value={k.rpd_count} max={1500} label="req/day" />
                      </td>

                      <td className="px-5 py-4">
                        {k.total_errors > 0 ? (
                          <span
                            className="text-red-400 text-xs cursor-help border-b border-dashed border-red-400/30"
                            title={k.last_error ?? "Unknown error"}
                          >
                            {k.total_errors} {k.total_errors === 1 ? "error" : "errors"}
                          </span>
                        ) : (
                          <span className="text-neutral-700 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleDeleteKey(k.id)}
                          disabled={deletingId === k.id}
                          className={`text-xs flex items-center gap-1.5 ml-auto px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40 ${
                            confirmDelete === k.id
                              ? "bg-red-500/15 border border-red-500/30 text-red-400 animate-glow"
                              : "text-neutral-600 hover:text-red-400 hover:bg-red-500/10 border border-transparent"
                          }`}
                          title={confirmDelete === k.id ? "Click again to confirm removal" : "Remove node"}
                        >
                          {deletingId === k.id ? (
                            <span className="w-3 h-3 rounded-full border border-neutral-600 border-t-white animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                          {confirmDelete === k.id ? "Confirm?" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Model Telemetry Table ── */}
      <div>
        <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
          <Database size={17} className="text-neutral-500" />
          Model Registry & Usage
        </h2>

        <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-[#0d0d0d] border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wide">
                  <th className="px-5 py-3.5 font-normal">Model</th>
                  <th className="px-5 py-3.5 font-normal">API Identifier</th>
                  <th className="px-5 py-3.5 font-normal">Free Tier Limit</th>
                  <th className="px-5 py-3.5 font-normal text-right">Your Usage</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.models)
                  .filter(([id]) => id !== "default")
                  .map(([id, details]: [string, any]) => {
                    const usage = data.usage[id] ?? 0;
                    const isWaitlisted = details.rpd === 0;
                    return (
                      <tr
                        key={id}
                        className={`border-b border-neutral-800/50 hover:bg-[#0d0d0d] transition-colors ${
                          isWaitlisted ? "opacity-40" : ""
                        }`}
                      >
                        <td className="px-5 py-3.5 font-medium text-white text-sm">
                          {details.name}
                        </td>

                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => handleCopy(id)}
                            className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 px-3 py-1.5 rounded-lg text-neutral-400 text-xs transition-all font-[family-name:var(--font-mono)]"
                            title="Copy API identifier"
                          >
                            {id}
                            {copiedId === id
                              ? <Check size={12} className="text-emerald-400 shrink-0" />
                              : <Copy size={12} className="text-neutral-600 shrink-0" />}
                          </button>
                        </td>

                        <td className="px-5 py-3.5 text-neutral-400 text-xs">
                          {details.rpd === 999999
                            ? <span className="text-emerald-500">Unlimited</span>
                            : details.rpd === 0
                            ? <span className="text-red-500">Waitlist / Unavailable</span>
                            : `${details.rpd.toLocaleString()} req/day`}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`text-sm font-semibold font-[family-name:var(--font-mono)] ${
                              usage > 0 ? "text-emerald-400" : "text-neutral-700"
                            }`}
                          >
                            {usage > 0 ? `${usage.toLocaleString()}` : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Footer note ── */}
      <div className="mt-10 pt-6 border-t border-neutral-800/50 flex items-center justify-between text-xs text-neutral-700">
        <span>Auto-refreshes every 6 seconds</span>
        <span>
          <ChevronUp size={12} className="inline mr-1" />
          GemPrism dashboard
        </span>
      </div>
    </div>
  );
}