"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Check, AlertCircle, Activity } from "lucide-react";
import { supabaseClient } from "@/lib/supabase";
import type { CatalogMetadata, ModelCatalogItem } from "@/lib/geminiModels";
import type { RequestTrace, TraceStorageMode } from "@/lib/requestTraces";
import type {
  DashboardCooldownItem,
  DashboardKeyItem,
  DashboardUsageItem,
} from "@/components/AnalyticsCharts";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface DashboardPayload {
  token: string;
  keys: DashboardKeyItem[];
  models: ModelCatalogItem[];
  catalogMeta: CatalogMetadata;
  usage: DashboardUsageItem[];
  cooldowns: DashboardCooldownItem[];
  traces: RequestTrace[];
  traceStorageMode: TraceStorageMode;
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

interface DashboardContextValue {
  session: Session | null;
  data: DashboardPayload | null;
  nowMs: number;
  refreshing: boolean;
  livePolling: boolean;
  setLivePolling: React.Dispatch<React.SetStateAction<boolean>>;
  selectedKeyId: string;
  setSelectedKeyId: React.Dispatch<React.SetStateAction<string>>;
  selectedModelId: string;
  setSelectedModelId: React.Dispatch<React.SetStateAction<string>>;
  rpmHistory: Array<{ time: string; rpm: number; rpd: number }>;
  copiedId: string | null;
  refreshStats: (quiet?: boolean, forceSyncModels?: boolean) => Promise<void>;
  addKey: (name: string, keyValue: string) => Promise<boolean>;
  deleteKey: (keyId: string) => Promise<boolean>;
  reviveKey: (keyId: string) => Promise<boolean>;
  clearAllCooldowns: () => Promise<boolean>;
  clearTraces: () => Promise<boolean>;
  handleCopy: (text: string) => void;
  handleSignOut: () => Promise<void>;
  addToast: (message: string, type?: ToastType) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

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
    <div className="fixed bottom-20 md:bottom-5 right-4 left-4 md:left-auto z-50 flex flex-col gap-2 pointer-events-none items-center md:items-end">
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

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [livePolling, setLivePolling] = useState(true);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [rpmHistory, setRpmHistory] = useState<Array<{ time: string; rpm: number; rpd: number }>>(
    []
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const removeToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  const performFetch = useCallback(
    async (activeSession: Session, quiet: boolean, forceSyncModels: boolean) => {
      try {
        const endpoint = forceSyncModels ? "/api/admin/stats?refresh=1" : "/api/admin/stats";
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${activeSession.access_token}` },
        });

        if (res.ok) {
          const json = (await res.json()) as DashboardPayload;
          setData(json);
          setNowMs(Date.now());

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
      }
    },
    [router, addToast]
  );

  const refreshStats = useCallback(
    async (quiet = false, forceSyncModels = false) => {
      if (!session) return;
      if (!quiet) setRefreshing(true);
      await performFetch(session, quiet, forceSyncModels);
      if (!quiet) setRefreshing(false);
    },
    [session, performFetch]
  );

  // Verify auth session on mount
  useEffect(() => {
    let mounted = true;
    supabaseClient.auth.getSession().then(({ data: { session: activeSession } }) => {
      if (!mounted) return;
      if (!activeSession) {
        router.push("/login");
        return;
      }
      setSession(activeSession);
    });
    return () => {
      mounted = false;
    };
  }, [router]);

  // Initial load + 6-second polling when livePolling is active
  useEffect(() => {
    if (!session) return;
    let active = true;

    void performFetch(session, true, false);

    if (!livePolling) {
      return () => {
        active = false;
      };
    }

    const pollId = setInterval(() => {
      if (active) {
        void performFetch(session, true, false);
      }
    }, 6000);

    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, [session, livePolling, performFetch]);

  const addKey = useCallback(
    async (name: string, keyValue: string): Promise<boolean> => {
      if (!session || !keyValue.trim()) return false;
      const fallbackName = `Key-${(data?.keys.length || 0) + 1}`;
      const finalName = name.trim() || fallbackName;

      const { error } = await supabaseClient.from("api_keys").insert({
        user_id: session.user.id,
        name: finalName,
        key_value: keyValue.trim(),
      });

      if (error) {
        addToast("Failed to add API key: " + error.message, "error");
        return false;
      }

      addToast("API key added — syncing live models…", "success");
      await performFetch(session, false, true);
      return true;
    },
    [session, data, addToast, performFetch]
  );

  const deleteKey = useCallback(
    async (keyId: string): Promise<boolean> => {
      if (!session) return false;
      try {
        const res = await fetch(`/api/admin/keys?id=${encodeURIComponent(keyId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          addToast("Failed to remove API key", "error");
          return false;
        }
        if (selectedKeyId === keyId) setSelectedKeyId("");
        addToast("API key removed", "success");
        await performFetch(session, true, false);
        return true;
      } catch {
        addToast("Failed to remove API key", "error");
        return false;
      }
    },
    [session, selectedKeyId, addToast, performFetch]
  );

  const reviveKey = useCallback(
    async (keyId: string): Promise<boolean> => {
      if (!session) return false;
      try {
        const res = await fetch("/api/admin/keys", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "revive", keyId }),
        });
        if (!res.ok) {
          addToast("Could not reset key status", "error");
          return false;
        }
        addToast("Key status & cooldowns reset", "success");
        await performFetch(session, true, false);
        return true;
      } catch {
        addToast("Could not reset key status", "error");
        return false;
      }
    },
    [session, addToast, performFetch]
  );

  const clearAllCooldowns = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "clear_cooldowns" }),
      });
      if (!res.ok) {
        addToast("Failed to clear cooldowns", "error");
        return false;
      }
      addToast("Cleared all active model cooldowns", "success");
      await performFetch(session, true, false);
      return true;
    } catch {
      addToast("Failed to clear cooldowns", "error");
      return false;
    }
  }, [session, addToast, performFetch]);

  const clearTraces = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    try {
      const res = await fetch("/api/admin/traces", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        addToast("Failed to clear request history", "error");
        return false;
      }
      addToast("Request trace history cleared", "success");
      await performFetch(session, true, false);
      return true;
    } catch {
      addToast("Failed to clear request history", "error");
      return false;
    }
  }, [session, addToast, performFetch]);

  const handleCopy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopiedId(text);
      addToast("Copied to clipboard", "success");
      setTimeout(() => setCopiedId((prev) => (prev === text ? null : prev)), 2000);
    },
    [addToast]
  );

  const handleSignOut = useCallback(async () => {
    await supabaseClient.auth.signOut();
    router.push("/login");
  }, [router]);

  return (
    <DashboardContext.Provider
      value={{
        session,
        data,
        nowMs,
        refreshing,
        livePolling,
        setLivePolling,
        selectedKeyId,
        setSelectedKeyId,
        selectedModelId,
        setSelectedModelId,
        rpmHistory,
        copiedId,
        refreshStats,
        addKey,
        deleteKey,
        reviveKey,
        clearAllCooldowns,
        clearTraces,
        handleCopy,
        handleSignOut,
        addToast,
      }}
    >
      <ToastList toasts={toasts} remove={removeToast} />
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used inside DashboardProvider");
  }
  return ctx;
}