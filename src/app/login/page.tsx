"use client";

import { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabase";
import { Eye, EyeOff, ArrowRight, MailCheck, Zap, Shield, Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoLayeredCore } from "@/components/Logo";

const PERKS = [
  { icon: Zap,      text: "Intelligent load balancing across your key pool" },
  { icon: Shield,   text: "Auto-cooldown & retry on per-model rate limits" },
  { icon: Activity, text: "Real-time telemetry and API health monitoring" },
];

export default function Login() {
  const router = useRouter();
  const [email,      setEmail     ] = useState("");
  const [password,   setPassword  ] = useState("");
  const [showPass,   setShowPass  ] = useState(false);
  const [isSignUp,   setIsSignUp  ] = useState(false);
  const [loading,    setLoading   ] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [error,      setError     ] = useState("");

  /* redirect if already logged in */
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push("/dashboard");
    });

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_e, session) => {
      if (session) router.push("/dashboard");
    });

    return () => subscription.unsubscribe();
  }, [router]);

  /* clear error when user types */
  useEffect(() => { setError(""); }, [email, password, isSignUp]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (isSignUp) {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setCheckEmail(true);
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) setError("Invalid email or password. Please try again.");
    }

    setLoading(false);
  };

  /* ── Check-email confirmation state ── */
  if (checkEmail) {
    return (
      <div className="min-h-screen bg-[#030303] bg-dots flex items-center justify-center px-4">
        <div className="bg-[#0a0a0a] p-8 md:p-10 rounded-3xl border border-emerald-500/20 w-full max-w-md flex flex-col items-center gap-5 text-center animate-fade-up shadow-[0_0_40px_rgba(16,185,129,0.05)]">
          <div className="h-16 w-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center">
            <MailCheck size={30} />
          </div>
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">Check your inbox</h2>
            <p className="text-neutral-400 text-sm leading-relaxed">
              We sent a verification link to{" "}
              <span className="text-white font-medium">{email}</span>.
              <br />Click it to activate your GemPrism account.
            </p>
          </div>
          <button
            onClick={() => setCheckEmail(false)}
            className="text-emerald-500 hover:text-emerald-400 text-sm font-medium transition-colors mt-2"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  /* ── Main layout ── */
  return (
    <div className="min-h-screen bg-[#030303] flex selection:bg-emerald-500/25">

      {/* ── Left panel (desktop only) ── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-[#060606] border-r border-neutral-800 p-12 bg-grid relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
        
        {/* logo */}
        <Link href="/" className="flex items-center gap-2 text-white font-bold text-xl relative z-10">
          <LogoLayeredCore className="text-emerald-500" size={24} />
          GemPrism
        </Link>

        {/* centre copy */}
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white leading-[1.2] mb-5 tracking-tight">
            One gateway token.<br />
            <span className="text-emerald-400">Unlimited throughput.</span>
          </h2>
          <p className="text-neutral-400 text-base leading-relaxed mb-10 max-w-sm">
            Pool your Gemini API keys into a single, high-availability gateway and let
            GemPrism handle model-specific rate limits and active failovers for you.
          </p>

          <ul className="space-y-6">
            {PERKS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-4 text-neutral-300 text-sm font-medium">
                <span className="shrink-0 w-10 h-10 bg-[#0a0a0a] border border-neutral-800 rounded-xl flex items-center justify-center text-emerald-400 shadow-lg">
                  <Icon size={18} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* footer note */}
        <p className="text-neutral-600 text-xs font-medium relative z-10">
          Free to use · Open source · Not affiliated with Google
        </p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 relative">
        <div className="absolute inset-0 bg-dots opacity-50 lg:hidden pointer-events-none" />

        {/* mobile logo */}
        <Link href="/" className="flex items-center justify-center gap-2 text-white font-bold text-xl mb-10 lg:hidden relative z-10">
          <LogoLayeredCore className="text-emerald-500" size={28} />
          GemPrism
        </Link>

        <div className="w-full max-w-sm bg-[#0a0a0a] lg:bg-transparent p-6 sm:p-8 lg:p-0 rounded-3xl lg:rounded-none border border-neutral-800/80 lg:border-none shadow-2xl lg:shadow-none relative z-10 animate-fade-up lg:animate-none">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-neutral-500 text-sm mb-8 font-medium">
            {isSignUp
              ? "Start routing Gemini API requests in minutes."
              : "Sign in to manage your gateway."}
          </p>

          <form onSubmit={handleAuth} className="flex flex-col gap-4.5" noValidate>
            {/* email */}
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-[#0f0f0f] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3.5 text-sm outline-none transition-all focus:shadow-[0_0_0_3px_rgba(16,185,129,0.1)]"
              />
            </div>

            {/* password */}
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={isSignUp ? "Min. 8 characters" : "Your password"}
                  required
                  className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3.5 pr-11 text-sm outline-none transition-all focus:shadow-[0_0_0_3px_rgba(16,185,129,0.1)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* inline error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-red-400 text-xs font-medium leading-relaxed animate-fade-in mt-1">
                {error}
              </div>
            )}

            {/* submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(16,185,129,0.25)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.3)]"
            >
              {loading
                ? <><span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" /> Please wait…</>
                : <>{isSignUp ? "Create account" : "Sign in"} <ArrowRight size={16} /></>}
            </button>
          </form>

          {/* toggle */}
          <div className="mt-8 text-center border-t border-neutral-800/60 pt-6">
            <button
              onClick={() => { setIsSignUp(s => !s); setError(""); }}
              className="text-sm text-neutral-400 hover:text-white font-medium transition-colors"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Need an account? Sign up — it's free"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}