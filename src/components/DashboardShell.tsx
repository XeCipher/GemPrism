"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  BarChart3,
  KeyRound,
  Database,
  RefreshCw,
  RotateCw,
  LogOut,
  Sparkles,
  Pause,
  Play,
  TrendingUp,
} from "lucide-react";
import { LogoLayeredCore } from "@/components/Logo";
import { useDashboard } from "@/components/DashboardContext";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-neutral-800/60 animate-pulse ${className}`} />;
}

const NAV_TABS = [
  { href: "/dashboard", label: "Overview", shortLabel: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/requests", label: "Requests", shortLabel: "Requests", icon: GitBranch },
  { href: "/dashboard/analytics", label: "Analytics", shortLabel: "Analytics", icon: BarChart3 },
  { href: "/dashboard/keys", label: "API Keys", shortLabel: "Keys", icon: KeyRound },
  { href: "/dashboard/models", label: "Models", shortLabel: "Models", icon: Database },
] as const;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    session,
    data,
    refreshing,
    livePolling,
    setLivePolling,
    refreshStats,
    clearAllCooldowns,
    handleSignOut,
  } = useDashboard();

  const isTabActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-[#030303] bg-dots text-neutral-300 p-4 md:p-8 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-7 h-7 rounded-lg" />
            <Skeleton className="w-40 h-6" />
          </div>
          <Skeleton className="w-36 h-8 rounded-lg" />
        </div>
        <Skeleton className="w-full h-12 rounded-2xl mb-7" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-12 gap-5">
          <Skeleton className="lg:col-span-7 h-72 rounded-2xl" />
          <Skeleton className="lg:col-span-5 h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const latestTrace = data.traces[0];
  const savedTraceCount = data.tracesTotal ?? data.traces.length;
  const liveTitle = livePolling
    ? "Live updates active (click to pause)"
    : "Live updates paused (click to resume)";
  const footerStatusText = livePolling
    ? "Live updates active · Models and usage sync automatically"
    : "Live updates paused";

  return (
    <div className="min-h-screen bg-[#030303] bg-dots text-neutral-300 overflow-x-hidden selection:bg-emerald-500/25">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-4 md:pt-7 pb-24 md:pb-10">
        {/* ── Top Header ── */}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-white font-semibold text-lg shrink-0"
            >
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
                : `Catalog · ${data.catalogMeta.count} models`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLivePolling((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                livePolling
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                  : "bg-[#0a0a0a] border-neutral-800 text-neutral-400 hover:text-white"
              }`}
              title={liveTitle}
            >
              {livePolling ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="hidden sm:inline">Live</span>
                  <Pause size={11} className="opacity-70" />
                </>
              ) : (
                <>
                  <Play size={11} className="text-neutral-400" />
                  <span className="hidden sm:inline">Paused</span>
                </>
              )}
            </button>

            {data.cooldowns.length > 0 && (
              <button
                type="button"
                onClick={() => void clearAllCooldowns()}
                className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
                title="Clear all active per-model cooldowns"
              >
                <RotateCw size={13} />
                <span className="hidden sm:inline">Clear {data.cooldowns.length} Cooldowns</span>
                <span className="sm:hidden">{data.cooldowns.length}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void refreshStats(false, true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-neutral-300 hover:text-white bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              title="Sync available Gemini models & refresh usage"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin text-emerald-400" : ""} />
              <span className="hidden sm:inline">Sync</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="flex items-center gap-1.5 text-neutral-400 hover:text-white bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {/* ── Desktop Sub-Navigation Tabs ── */}
        <nav
          aria-label="Dashboard navigation"
          className="hidden md:flex items-center justify-between gap-2 bg-[#0a0a0a] border border-neutral-800/90 p-1.5 rounded-2xl mb-7 shadow-lg"
        >
          <div className="flex items-center gap-1.5">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = isTabActive(tab.href);

              let badge: React.ReactNode = null;
              if (tab.href === "/dashboard/keys") {
                badge = (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] ${
                      active ? "bg-black/20 text-black" : "bg-neutral-900 text-neutral-400"
                    }`}
                  >
                    {data.keys.length}
                  </span>
                );
              } else if (tab.href === "/dashboard/models") {
                badge = (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] ${
                      active ? "bg-black/20 text-black" : "bg-neutral-900 text-neutral-400"
                    }`}
                  >
                    {data.models.length}
                  </span>
                );
              } else if (tab.href === "/dashboard/requests" && savedTraceCount > 0) {
                const dotColor = !latestTrace
                  ? "bg-emerald-400"
                  : !latestTrace.success
                    ? "bg-red-500"
                    : latestTrace.didFallback
                      ? "bg-amber-400"
                      : "bg-emerald-400";
                badge = (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${active ? "bg-black" : dotColor}`}
                    />
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] ${
                        active ? "bg-black/20 text-black" : "bg-neutral-900 text-neutral-400"
                      }`}
                    >
                      {savedTraceCount.toLocaleString()}
                    </span>
                  </span>
                );
              }

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    active
                      ? "bg-emerald-500 text-black shadow-sm"
                      : "text-neutral-400 hover:text-white hover:bg-[#111]"
                  }`}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                  {badge}
                </Link>
              );
            })}
          </div>

          <div className="pr-3 text-[11px] text-neutral-500 font-[family-name:var(--font-mono)] hidden lg:flex items-center gap-3">
            <span>
              RPM:{" "}
              <strong className="text-cyan-400">{data.summary.active_rpm.toLocaleString()}</strong>
            </span>
            <span className="text-neutral-800">|</span>
            <span>
              Today:{" "}
              <strong className="text-emerald-400">
                {data.summary.today_requests.toLocaleString()}
              </strong>
            </span>
          </div>
        </nav>

        {/* ── Active Page Body ── */}
        <main className="min-w-0">{children}</main>

        {/* ── Desktop Footer ── */}
        <footer className="mt-10 pt-6 border-t border-neutral-800/50 hidden md:flex items-center justify-between gap-3 text-xs text-neutral-600">
          <span className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                livePolling ? "bg-emerald-500" : "bg-neutral-600"
              }`}
            />
            {footerStatusText}
          </span>
          <span className="font-medium flex items-center gap-1">
            GemPrism Gateway
            <TrendingUp size={12} className="opacity-50" />
          </span>
        </footer>
      </div>

      {/* ── Mobile Bottom Navigation Bar ── */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#070707]/95 backdrop-blur-xl border-t border-neutral-800/90 px-1 py-1.5 grid grid-cols-5 gap-0.5"
      >
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold transition-colors relative ${
                active ? "text-emerald-400 bg-emerald-500/10" : "text-neutral-500 hover:text-white"
              }`}
            >
              <Icon size={17} />
              <span className="truncate">{tab.shortLabel}</span>
              {tab.href === "/dashboard/requests" && latestTrace && (
                <span
                  className={`absolute top-1.5 right-4 w-1.5 h-1.5 rounded-full ${
                    !latestTrace.success
                      ? "bg-red-500"
                      : latestTrace.didFallback
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                  }`}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}