"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity, Zap, Shield, ArrowRight, ArrowDown, ChevronRight,
} from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { LogoLayeredCore } from "@/components/Logo";

/* ─── Custom GitHub Icon ─── */
function CustomGithubIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/* ─── Types ─── */
type KeyStatus = "healthy" | "cooling" | "dead";
interface ApiKeySim { id: number; status: KeyStatus; rpm: number }

/* ─── Constants ─── */
const STATUSES: KeyStatus[] = ["healthy", "healthy", "healthy", "healthy", "cooling", "dead"];

const FEATURES =[
  {
    icon: Zap,
    title: "Intelligent Load Balancing",
    desc: "Distributes traffic across your API key pool in real time, actively tracking and favoring keys with the lowest RPM and RPD counts for the exact model you requested.",
  },
  {
    icon: Shield,
    title: "Auto-Cooldown & Retry",
    desc: "Hitting a 429 rate-limit? The exact API key is sidelined for 90 seconds and the request is instantly re-routed to the next healthy key automatically.",
  },
  {
    icon: Activity,
    title: "Live Telemetry",
    desc: "Track API Key health, error rates, and granular per-model usage across your pool from a real-time dashboard.",
  },
];

const STEPS =[
  "Create a free account and add your Gemini API keys.",
  "Receive a single secure Gateway Token for your project.",
  "Point the Google GenAI SDK's baseUrl at GemPrism.",
  "Watch live as we balance, retry, and recover failed keys.",
];

const CODE = `import { GoogleGenAI } from "@google/genai";

// ① Use your GemPrism Gateway Token as the API key
// ② Point baseUrl at your GemPrism instance
const ai = new GoogleGenAI({
  apiKey: "gp_live_your_gateway_token",
  baseUrl: "https://gemprism.vercel.app/api/proxy",
});

// No other changes needed - full SDK compatibility
const response = await ai.models.generateContent({
  model: "gemini-pro-latest",
  contents: "Explain quantum entanglement in one sentence.",
});

console.log(response.text);`;

/* ─── Animated Key-Node Grid ─── */
function ApiKeyGrid() {
  const [keys, setKeys] = useState<ApiKeySim[]>(() =>
    Array.from({ length: 18 }, (_, i) => ({ id: i, status: "healthy" as KeyStatus, rpm: 0 }))
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setKeys(
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
        rpm: Math.floor(Math.random() * 14),
      }))
    );
    setMounted(true);
  },[]);

  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => {
      setKeys(prev =>
        prev.map(k => {
          if (Math.random() < 0.12) {
            const s = STATUSES[Math.floor(Math.random() * STATUSES.length)];
            return { ...k, status: s, rpm: Math.floor(Math.random() * 14) };
          }
          return { ...k, rpm: Math.max(0, k.rpm + Math.floor(Math.random() * 3 - 1)) };
        })
      );
    }, 1400);
    return () => clearInterval(t);
  }, [mounted]);

  const color: Record<KeyStatus, string> = {
    healthy: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
    cooling: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]",
    dead:    "bg-red-500   shadow-[0_0_8px_rgba(239,68,68,0.4)]",
  };

  return (
    <div className="relative rounded-2xl border border-neutral-800 bg-[#070707] p-5 sm:p-6 w-full max-w-sm mx-auto shadow-2xl">
      <div className="flex items-center justify-between mb-5 font-[family-name:var(--font-mono)] text-[11px] sm:text-xs font-semibold">
        <span className="text-neutral-500">API KEY POOL</span>
        <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          ROUTING
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2 sm:gap-3">
        {keys.map(k => (
          <div key={k.id} className="flex flex-col items-center gap-1.5 group cursor-default">
            <div
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-sm sm:rounded-md transition-all duration-500 ${color[k.status]} ${
                k.status === "healthy" ? "animate-pulse" : ""
              }`}
            />
            <span className="text-[9px] sm:text-[10px] text-neutral-600 group-hover:text-neutral-400 transition-colors font-[family-name:var(--font-mono)] font-medium">
              {k.rpm}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-neutral-800/60 flex flex-wrap items-center justify-between font-[family-name:var(--font-mono)] text-[9px] sm:text-[10px] md:text-xs font-medium text-neutral-500 gap-2">
        {(["healthy", "cooling", "dead"] as KeyStatus[]).map(s => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-sm ${color[s].split(" ")[0]}`} />
            {s.toUpperCase()}:&nbsp;{keys.filter(k => k.status === s).length}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#030303] bg-grid text-neutral-300 overflow-x-hidden selection:bg-emerald-500/25">

      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 border-b border-neutral-800/60 bg-[#030303]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white font-bold tracking-tight text-lg sm:text-xl">
            <LogoLayeredCore className="text-emerald-500" size={24} />
            GemPrism
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href="https://github.com/XeCipher/GemPrism"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-neutral-400 hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <CustomGithubIcon size={22} />
            </a>
            <Link
              href="/dashboard"
              className="hidden sm:flex items-center gap-1 text-sm font-medium text-neutral-400 hover:text-white transition-colors px-2"
            >
              Dashboard
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold px-4 py-2 sm:px-5 sm:py-2.5 rounded-full transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            >
              Get Started <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 lg:pt-32 pb-16 sm:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* left */}
          <div className="opacity-0 animate-fade-up text-center lg:text-left flex flex-col items-center lg:items-start min-w-0" style={{ animationDelay: "0ms", animationFillMode: "forwards" }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] sm:text-xs font-bold tracking-widest uppercase mb-6 sm:mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Public Beta · Free to Use
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6">
              Never hit a<br />
              <span className="shimmer-text">rate limit again.</span>
            </h1>

            <p className="text-base sm:text-lg text-neutral-400 leading-relaxed mb-8 sm:mb-10 max-w-lg mx-auto lg:mx-0">
              GemPrism pools your Google Gemini API keys into a single gateway endpoint.
              Requests are load-balanced based on exact model limits, keys cool down automatically, and
              dead keys are retired, all without requiring changes to your SDK code.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-6 py-3.5 sm:py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto text-sm sm:text-base"
              >
                Start routing free <ArrowRight size={18} />
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-semibold px-6 py-3.5 sm:py-4 rounded-xl transition-colors w-full sm:w-auto text-sm sm:text-base"
              >
                See how it works
              </a>
            </div>

            <div className="mt-12 flex flex-wrap justify-center lg:justify-start gap-x-8 gap-y-4 text-sm text-neutral-500">
              {[
                { v: "100%", l: "Open source" },
                { v: "0ms",  l: "Cold starts" },
                { v: "BYOK", l: "Your keys, your control" },
              ].map(({ v, l }) => (
                <div key={l} className="flex flex-col items-center lg:items-start">
                  <span className="text-white font-bold text-lg" style={{ fontFamily: "var(--font-mono)" }}>{v}</span>
                  <span className="text-xs font-medium uppercase tracking-wider">{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* right - live grid */}
          <div
            className="opacity-0 animate-fade-up flex justify-center lg:justify-end w-full min-w-0"
            style={{ animationDelay: "150ms", animationFillMode: "forwards" }}
          >
            <ApiKeyGrid />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-neutral-800/50 py-20 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-xs font-bold tracking-widest text-emerald-500 uppercase mb-3">
              Why GemPrism
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
              Production-grade AI routing
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="group bg-[#0a0a0a] border border-neutral-800 hover:border-emerald-500/30 rounded-3xl p-8 transition-all duration-300 hover:bg-[#0c0c0c] hover:shadow-[0_0_30px_rgba(16,185,129,0.05)]"
              >
                <div className="h-12 w-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors shadow-inner">
                  <f.icon size={24} />
                </div>
                <h3 className="text-white font-bold text-xl mb-3">{f.title}</h3>
                <p className="text-neutral-400 text-sm sm:text-base leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it Works + Code ── */}
      <section id="how-it-works" className="border-t border-neutral-800/50 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center lg:items-start">

          {/* steps */}
          <div className="order-2 lg:order-1 min-w-0">
            <p className="text-xs font-bold tracking-widest text-emerald-500 uppercase mb-3">
              Drop-in integration
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 tracking-tight">
              Two lines of code.<br />Infinite scalability.
            </h2>
            <p className="text-neutral-400 text-base lg:text-lg leading-relaxed mb-10">
              GemPrism acts as a transparent proxy, so there’s no new SDK to learn. Just upload your
              Gemini API keys, swap the <code className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-sm font-[family-name:var(--font-mono)] border border-emerald-500/20">baseUrl</code>, and you&apos;re done.
            </p>

            <ol className="space-y-6">
              {STEPS.map((step, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span
                    className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-bold flex items-center justify-center mt-0.5"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-neutral-300 text-sm sm:text-base leading-relaxed font-medium">{step}</span>
                </li>
              ))}
            </ol>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 mt-10 bg-white hover:bg-neutral-100 text-black font-bold px-6 py-3.5 rounded-xl transition-colors text-sm sm:text-base shadow-lg"
            >
              Create free account <ArrowRight size={18} />
            </Link>
          </div>

          {/* code block */}
          <div className="relative order-1 lg:order-2 w-full max-w-full min-w-0">
            <div className="absolute -inset-4 sm:-inset-8 bg-gradient-to-tr from-emerald-500/10 to-cyan-500/10 blur-3xl rounded-full pointer-events-none" />
            <CodeBlock code={CODE} />
          </div>
        </div>
      </section>

      {/* ── Request Flow Diagram ── */}
      <section className="border-t border-neutral-800/50 py-20 bg-[#050505]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-bold tracking-widest text-emerald-500 uppercase mb-3">
            Architecture
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-12 lg:mb-16 tracking-tight">Request flow</h2>

          {/* Flowchart container (Responsive Flex/Grid logic to ensure it doesn't break UI on mobile) */}
          <div className="flex flex-col lg:flex-row items-center justify-center gap-0">
            {[
              { label: "Your App",        sub: "Any GenAI SDK",          color: "border-neutral-700  bg-[#0a0a0a]" },
              { label: "GemPrism",        sub: "Edge Proxy",             color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]" },
              { label: "Key Pool",        sub: "Your API Keys",          color: "border-neutral-700  bg-[#0a0a0a]" },
              { label: "Google AI",       sub: "Gen Language API",       color: "border-neutral-700  bg-[#0a0a0a]" },
            ].map((box, i, arr) => (
              <React.Fragment key={i}>
                <div className={`border rounded-2xl px-6 py-5 text-center w-full max-w-[220px] sm:w-auto sm:min-w-[160px] ${box.color}`}>
                  <div className={`font-bold text-sm sm:text-base ${box.color.includes("emerald") ? "text-emerald-300" : "text-white"}`}>
                    {box.label}
                  </div>
                  <div className="text-neutral-500 text-xs sm:text-sm mt-1.5 font-medium">{box.sub}</div>
                </div>

                {i < arr.length - 1 && (
                  <div className="flex flex-col lg:flex-row items-center justify-center h-8 lg:h-auto w-auto lg:w-10 text-neutral-500">
                    <div className="h-full lg:h-px w-px lg:w-full bg-neutral-700" />
                    <ArrowDown size={16} className="lg:hidden -mt-1.5 shrink-0" />
                    <ArrowRight size={16} className="hidden lg:block -ml-1.5 shrink-0" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="mt-12 inline-flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 text-xs sm:text-sm font-medium text-neutral-500 text-left">
            <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> Healthy - routes normally</span>
            <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" /> Cooling - retried after 90s</span>
            <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"  /> Dead - retired from pool</span>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-neutral-800/50 py-24 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent pointer-events-none" />
        <div className="max-w-2xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 tracking-tight">
            Ready to stop worrying<br className="hidden sm:block" /> about rate limits?
          </h2>
          <p className="text-neutral-400 text-base sm:text-lg mb-10">
            Set up in under two minutes. Free forever for personal use.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-8 py-4 rounded-xl text-base sm:text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]"
          >
            Get started for free <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-neutral-800/50 py-10 bg-[#020202]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg">
            <LogoLayeredCore className="text-emerald-500" size={20} />
            GemPrism
          </div>
          <p className="text-xs sm:text-sm text-neutral-600 text-center font-medium">
            Not affiliated with Google. Gemini is a trademark of Google LLC.
          </p>
          <a
            href="https://github.com/XeCipher/GemPrism"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors text-sm font-semibold"
          >
            <CustomGithubIcon size={18} /> Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}