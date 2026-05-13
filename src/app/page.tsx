"use client";

import { Activity, Zap, Shield, Code2, ArrowRight, Layers, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

// Custom GitHub SVG Component
const GithubIcon = ({ size = 24, className = "" }: { size?: number | string; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24c3-.34 6-1.53 6-6.76a5.2 5.2 0 0 0-1.4-3.6 5.2 5.2 0 0 0-.1-3.7s-1-.3-3.5 1.4a11.5 11.5 0 0 0-6 0C6.5 1.6 5.5 1.9 5.5 1.9a5.2 5.2 0 0 0-.1 3.7 5.2 5.2 0 0 0-1.4 3.6c0 5.2 3 6.4 6 6.76A4.8 4.8 0 0 0 9 18v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function LandingPage() {
  const [copied, setCopied] = useState(false);

  const codeSnippet = `import { GoogleGenAI } from "@google/genai";

// 1. Initialize with your GemPrism Gateway Token
// 2. Point the base URL to your GemPrism instance
const ai = new GoogleGenAI({
  apiKey: "gp_live_your_gateway_token",
  baseUrl: "https://gemprism.vercel.app/api/proxy",
});

// GemPrism automatically load-balances across your 
// uploaded keys, handling rate limits & cooldowns!
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Explain quantum computing in one sentence.",
});

console.log(response.text);`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(codeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-300 font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="border-b border-neutral-800/50 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold tracking-tight">
            <Layers className="text-emerald-500" size={24} />
            <span className="text-lg">GemPrism</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-sm font-medium">
            <a 
              href="https://github.com/XeCipher/GemPrism" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-neutral-400 hover:text-white transition-colors flex items-center p-1 sm:p-2"
              title="View Source on GitHub"
            >
              <GithubIcon size={20} />
            </a>
            <Link href="/login" className="bg-white text-black px-4 py-2 rounded-full hover:bg-neutral-200 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide mb-6 sm:mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Public Beta Now Live
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white tracking-tight mb-6 leading-tight">
          High-Availability Routing <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
            for the Gemini API.
          </span>
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2">
          Bring your own keys. We handle the load balancing, automatic rate-limit cooling, and gateway traversal so your AI applications never experience downtime.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4 sm:px-0">
          <Link href="/login" className="flex items-center gap-2 bg-emerald-500 text-black px-6 py-3.5 sm:py-3 rounded-full font-medium hover:bg-emerald-400 transition-all w-full sm:w-auto justify-center">
            Start Routing Free <ArrowRight size={18} />
          </Link>
          <a href="#how-it-works" className="flex items-center gap-2 bg-[#111] border border-neutral-800 text-white px-6 py-3.5 sm:py-3 rounded-full font-medium hover:bg-[#1a1a1a] transition-all w-full sm:w-auto justify-center">
            View Documentation
          </a>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 border-t border-neutral-800/50">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
          {[
            {
              icon: Zap,
              title: "Intelligent Load Balancing",
              desc: "Distribute traffic evenly across your pool of API keys based on real-time RPM and RPD limits."
            },
            {
              icon: Shield,
              title: "Auto-Cooldown & Retry",
              desc: "If a key hits a 429 rate limit, we instantly sideline it for 90 seconds and seamlessly route the request to the next healthy node."
            },
            {
              icon: Activity,
              title: "Granular Telemetry",
              desc: "Monitor your usage, dead nodes, and model consumption in real-time through a beautiful developer dashboard."
            }
          ].map((feature, i) => (
            <div key={i} className="bg-[#0a0a0a] border border-neutral-800/80 p-6 sm:p-8 rounded-2xl hover:border-neutral-700 transition-colors">
              <div className="h-12 w-12 bg-neutral-900 border border-neutral-800 flex items-center justify-center rounded-xl mb-6 text-emerald-400">
                <feature.icon size={24} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
              <p className="text-neutral-400 leading-relaxed text-sm sm:text-base">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works / Code Section */}
      <section id="how-it-works" className="bg-[#0a0a0a] py-16 sm:py-24 border-y border-neutral-800/50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
          
          {/* Text Container: min-w-0 ensures it doesn't break grid on mobile */}
          <div className="min-w-0">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">Drop-in replacement for Google Gen AI.</h2>
            <p className="text-neutral-400 text-base sm:text-lg mb-8 leading-relaxed">
              GemPrism acts as a transparent proxy. You don't need to learn a new SDK. Just upload your Google API keys to our secure vault, get your single Gateway Token, and change your `baseUrl`.
            </p>
            <ul className="space-y-4">
              {[
                "Create an account and upload multiple Gemini API keys.",
                "Generate a single, secure Gateway Token.",
                "Update your SDK initialization (as shown).",
                "Watch the dashboard as we handle the traffic routing!"
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-neutral-300 text-sm sm:text-base" >
                  <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={20} />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Code Container: min-w-0 is required for horizontal scrolling inside CSS Grids */}
          <div className="relative w-full min-w-0">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-cyan-500/10 blur-3xl rounded-full"></div>
            <div className="relative bg-[#050505] border border-neutral-800 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl w-full">
              <div className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <Code2 size={16} className="text-neutral-500" />
                  <span className="text-sm font-mono text-neutral-400">app.ts</span>
                </div>
                <button 
                  onClick={copyToClipboard}
                  className="text-xs font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 p-1"
                >
                  {copied ? <span className="text-emerald-400">Copied!</span> : "Copy code"}
                </button>
              </div>
              
              {/* Mobile optimized code block: w-max ensures background covers entire scrollable area */}
              <div className="p-4 w-full overflow-x-auto">
                <pre className="text-xs sm:text-sm font-mono leading-relaxed text-neutral-300 w-max min-w-full">
                  <code>
                    {codeSnippet.split('\n').map((line, i) => (
                      <div key={i} className="flex gap-4">
                        <span className="text-neutral-600 select-none w-4 text-right shrink-0">{i + 1}</span>
                        <span>
                          {line.includes('//') ? (
                            <span className="text-neutral-500">{line}</span>
                          ) : line.includes('import') || line.includes('const') || line.includes('await') || line.includes('new') ? (
                            <span className="text-emerald-400">{line}</span>
                          ) : (
                            line
                          )}
                        </span>
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-neutral-800/50 mt-12">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Layers className="text-emerald-500" size={20} />
          GemPrism
        </div>
        <p className="text-sm text-neutral-500 text-center sm:text-left">
          Built for high-scale AI applications. Not officially affiliated with Google.
        </p>
        <div className="flex items-center gap-4">
          <a 
            href="https://github.com/XeCipher/GemPrism" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-neutral-500 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <GithubIcon size={18} /> Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}