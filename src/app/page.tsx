"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Activity, Zap, Shield, ArrowRight, Layers, CheckCircle2,
  Copy, Check, ChevronRight,
} from "lucide-react";

/* ─── Custom GitHub Icon ─── */
function CustomGithubIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/* ─── Types ─── */
type NodeStatus = "healthy" | "cooling" | "dead";
interface Node { id: number; status: NodeStatus; rpm: number }

/* ─── Constants ─── */
const STATUSES: NodeStatus[] = ["healthy", "healthy", "healthy", "healthy", "cooling", "dead"];

const FEATURES =[
  {
    icon: Zap,
    title: "Intelligent Load Balancing",
    desc: "Distributes traffic across your API key pool in real time, favouring keys with the lowest RPM and RPD counts.",
  },
  {
    icon: Shield,
    title: "Auto-Cooldown & Retry",
    desc: "429 rate-limited? The node is sidelined for 90 seconds and the request is instantly rerouted to the next healthy key.",
  },
  {
    icon: Activity,
    title: "Live Telemetry",
    desc: "Track node health, error rates, and per-model usage from a real-time dashboard — no extra tooling required.",
  },
];

const STEPS = [
  "Create a free account and add your Gemini API keys.",
  "Receive a single secure Gateway Token for your project.",
  "Point the Google GenAI SDK's baseUrl at GemPrism.",
  "Watch live as we balance, retry, and recover failed nodes.",
];

const CODE = `import { GoogleGenAI } from "@google/genai";

// ① Use your GemPrism Gateway Token as the API key
// ② Point baseUrl at your GemPrism instance
const ai = new GoogleGenAI({
  apiKey: "gp_live_your_gateway_token",
  baseUrl: "https://gemprism.vercel.app/api/proxy",
});

// No other changes needed — full SDK compatibility
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Explain quantum entanglement in one sentence.",
});

console.log(response.text);`;

/* ─── Syntax Highlighter ─── */
function HighlightedLine({ line }: { line: string }) {
  if (line.trim().startsWith("//") || line.trim().startsWith("# ")) {
    return <span className="text-neutral-500 italic">{line}</span>;
  }
  const keyword = /\b(import|from|const|await|new|return|async|function)\b/g;
  const string  = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  const prop    = /\b(baseUrl|apiKey|model|contents)\b/g;

  let result = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  result = result.replace(string,  (m) => `<em class="not-italic text-amber-300">${m}</em>`);
  result = result.replace(keyword, (m) => `<strong class="font-normal text-emerald-400">${m}</strong>`);
  result = result.replace(prop,    (m) => `<span class="text-cyan-400">${m}</span>`);

  return <span dangerouslySetInnerHTML={{ __html: result }} />;
}

/* ─── Animated Key-Node Grid ─── */
function NodeGrid() {
  // Start with a stable, deterministic state so server and client render identically.
  // Math.random() is only called client-side inside useEffect.
  const [nodes, setNodes] = useState<Node[]>(() =>
    Array.from({ length: 18 }, (_, i) => ({ id: i, status: "healthy" as NodeStatus, rpm: 0 }))
  );
  const [mounted, setMounted] = useState(false);

  // Randomise after first paint so SSR HTML matches the initial client render.
  useEffect(() => {
    setNodes(
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
      setNodes(prev =>
        prev.map(n => {
          if (Math.random() < 0.12) {
            const s = STATUSES[Math.floor(Math.random() * STATUSES.length)];
            return { ...n, status: s, rpm: Math.floor(Math.random() * 14) };
          }
          return { ...n, rpm: Math.max(0, n.rpm + Math.floor(Math.random() * 3 - 1)) };
        })
      );
    }, 1400);
    return () => clearInterval(t);
  }, [mounted]);

  const color: Record<NodeStatus, string> = {
    healthy: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
    cooling: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]",
    dead:    "bg-red-500   shadow-[0_0_8px_rgba(239,68,68,0.4)]",
  };

  return (
    <div className="relative rounded-2xl border border-neutral-800 bg-[#070707] p-6 w-full max-w-sm mx-auto shadow-2xl">
      {/* header */}
      <div className="flex items-center justify-between mb-5 font-[family-name:var(--font-mono)] text-xs">
        <span className="text-neutral-500">GATEWAY NODES</span>
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          LIVE
        </span>
      </div>

      {/* grid */}
      <div className="grid grid-cols-6 gap-2.5">
        {nodes.map(n => (
          <div key={n.id} className="flex flex-col items-center gap-1 group cursor-default">
            <div
              className={`w-5 h-5 rounded-sm transition-all duration-500 ${color[n.status]} ${
                n.status === "healthy" ? "animate-pulse" : ""
              }`}
            />
            <span className="text-[9px] text-neutral-600 group-hover:text-neutral-400 transition-colors font-[family-name:var(--font-mono)]">
              {n.rpm}
            </span>
          </div>
        ))}
      </div>

      {/* legend */}
      <div className="mt-5 pt-4 border-t border-neutral-800/60 flex items-center justify-between font-[family-name:var(--font-mono)] text-[10px] text-neutral-500">
        {(["healthy","cooling","dead"] as NodeStatus[]).map(s => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-sm ${color[s].split(" ")[0]}`} />
            {s.toUpperCase()}:&nbsp;{nodes.filter(n => n.status === s).length}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function LandingPage() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(CODE).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#030303] bg-grid text-neutral-300 overflow-x-hidden selection:bg-emerald-500/25">

      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 border-b border-neutral-800/60 bg-[#030303]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white font-semibold tracking-tight text-lg">
            <Layers className="text-emerald-500" size={22} />
            GemPrism
          </Link>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com/XeCipher/GemPrism"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-neutral-400 hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <CustomGithubIcon size={20} />
            </a>
            <Link
              href="/dashboard"
              className="hidden sm:flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors px-3 py-2"
            >
              Dashboard
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold px-4 py-2 rounded-full transition-colors"
            >
              Get Started <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 sm:pt-32 pb-16 sm:pb-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* left */}
          <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0ms", animationFillMode: "forwards" }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold tracking-wide mb-7">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Public Beta · Free to Use
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-5">
              Never hit a<br />
              <span className="shimmer-text">rate limit again.</span>
            </h1>

            <p className="text-base sm:text-lg text-neutral-400 leading-relaxed mb-8 max-w-lg">
              GemPrism pools your Google Gemini API keys into a single gateway endpoint.
              Requests are load-balanced, rate-limited keys cool down automatically, and
              dead keys are retired — all without changing your SDK code.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-6 py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Start routing free <ArrowRight size={18} />
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white px-6 py-3.5 rounded-xl transition-colors"
              >
                See how it works
              </a>
            </div>

            <div className="mt-10 flex items-center gap-6 text-sm text-neutral-500">
              {[
                { v: "100%", l: "Open source" },
                { v: "0ms",  l: "Cold starts (edge runtime)" },
                { v: "BYOK", l: "Your keys, your control" },
              ].map(({ v, l }) => (
                <div key={l} className="flex flex-col">
                  <span className="text-white font-semibold text-base" style={{ fontFamily: "var(--font-mono)" }}>{v}</span>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* right — live node grid */}
          <div
            className="opacity-0 animate-fade-up flex justify-center lg:justify-end"
            style={{ animationDelay: "150ms", animationFillMode: "forwards" }}
          >
            <NodeGrid />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-neutral-800/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold tracking-widest text-emerald-500 uppercase mb-3">
              Why GemPrism
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Production-grade AI routing
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="group bg-[#080808] border border-neutral-800 hover:border-emerald-500/30 rounded-2xl p-7 transition-all duration-300 hover:bg-[#0a0a0a]"
              >
                <div className="h-11 w-11 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-5 text-emerald-400 group-hover:bg-emerald-500/15 transition-colors">
                  <f.icon size={22} />
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it Works + Code ── */}
      <section id="how-it-works" className="border-t border-neutral-800/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-16 items-start">

          {/* steps */}
          <div>
            <p className="text-xs font-semibold tracking-widest text-emerald-500 uppercase mb-3">
              Drop-in integration
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              Two lines of code.<br />Infinite scalability.
            </h2>
            <p className="text-neutral-400 text-base leading-relaxed mb-10">
              GemPrism is a transparent proxy — no new SDK to learn. Just upload your
              Gemini API keys, swap the <code className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-sm font-[family-name:var(--font-mono)]">baseUrl</code>, and you&apos;re done.
            </p>

            <ol className="space-y-5">
              {STEPS.map((step, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span
                    className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-bold flex items-center justify-center mt-0.5"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-neutral-300 text-sm sm:text-base leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 mt-10 bg-white hover:bg-neutral-100 text-black font-semibold px-5 py-3 rounded-xl transition-colors text-sm"
            >
              Create free account <ArrowRight size={16} />
            </Link>
          </div>

          {/* code block */}
          <div className="relative">
            <div className="absolute inset-0 -m-8 bg-gradient-to-tr from-emerald-500/5 to-cyan-500/5 blur-3xl rounded-full pointer-events-none" />
            <div className="relative bg-[#070707] border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
              {/* titlebar */}
              <div className="flex items-center justify-between px-5 py-3 bg-[#0a0a0a] border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-neutral-700" />
                    <div className="w-3 h-3 rounded-full bg-neutral-700" />
                    <div className="w-3 h-3 rounded-full bg-neutral-700" />
                  </div>
                  <span className="text-xs text-neutral-500 font-[family-name:var(--font-mono)]">app.ts</span>
                </div>
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors"
                >
                  {copied
                    ? <><Check size={13} className="text-emerald-400" /><span className="text-emerald-400">Copied</span></>
                    : <><Copy size={13} /><span>Copy</span></>}
                </button>
              </div>

              {/* code */}
              <div className="p-5 overflow-x-auto">
                <pre className="text-xs sm:text-sm leading-relaxed font-[family-name:var(--font-mono)]">
                  {CODE.split("\n").map((line, i) => (
                    <div key={i} className="flex gap-4 min-w-max">
                      <span className="text-neutral-700 select-none w-4 text-right shrink-0 text-xs">{i + 1}</span>
                      <HighlightedLine line={line} />
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Request Flow Diagram ── */}
      <section className="border-t border-neutral-800/50 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-semibold tracking-widest text-emerald-500 uppercase mb-3">
            Architecture
          </p>
          <h2 className="text-3xl font-bold text-white mb-12">Request flow</h2>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-0">
            {[
              { label: "Your App",        sub: "Any GenAI SDK",          color: "border-neutral-700  bg-[#0a0a0a]" },
              { label: "GemPrism",        sub: "Edge Proxy",             color: "border-emerald-500/40 bg-emerald-500/5 text-emerald-400" },
              { label: "Key Pool",        sub: "Your Gemini API Keys",   color: "border-neutral-700  bg-[#0a0a0a]" },
              { label: "Google AI",       sub: "Generative Language API",color: "border-neutral-700  bg-[#0a0a0a]" },
            ].map((box, i, arr) => (
              <div key={i} className="flex items-center">
                <div className={`border rounded-xl px-5 py-4 text-center min-w-[130px] ${box.color}`}>
                  <div className={`font-semibold text-sm ${box.color.includes("emerald") ? "text-emerald-300" : "text-white"}`}>
                    {box.label}
                  </div>
                  <div className="text-neutral-500 text-xs mt-1">{box.sub}</div>
                </div>
                {i < arr.length - 1 && (
                  <div className="flex items-center px-2 sm:px-3">
                    <div className="h-px w-6 sm:w-8 bg-neutral-700" />
                    <ArrowRight size={14} className="text-neutral-600 -ml-1" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Healthy — routes normally</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Cooling — retried after 90s</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-500"  /> Dead — retired from pool</span>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-neutral-800/50 py-20">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to stop worrying<br />about rate limits?
          </h2>
          <p className="text-neutral-400 mb-8">
            Set up in under two minutes. Free forever for personal use.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-8 py-4 rounded-xl text-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Get started for free <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-neutral-800/50 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Layers className="text-emerald-500" size={18} />
            GemPrism
          </div>
          <p className="text-xs text-neutral-600 text-center">
            Not affiliated with Google. Gemini is a trademark of Google LLC.
          </p>
          <a
            href="https://github.com/XeCipher/GemPrism"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors text-sm"
          >
            <CustomGithubIcon size={16} /> Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}