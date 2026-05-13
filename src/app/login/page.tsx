"use client";

import { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabase";
import { Layers, Eye, EyeOff, ArrowRight, MailCheck, Zap, Shield, Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PERKS = [
  { icon: Zap,      text: "Intelligent load balancing across your key pool" },
  { icon: Shield,   text: "Auto-cooldown & retry on 429 rate limits" },
  { icon: Activity, text: "Real-time telemetry and node health monitoring" },
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
        <div className="bg-[#0a0a0a] p-10 rounded-2xl border border-emerald-500/20 w-full max-w-md flex flex-col items-center gap-5 text-center animate-fade-up shadow-2xl">
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
            className="text-emerald-500 hover:text-emerald-400 text-sm font-medium transition-colors"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  /* ── Main layout ── */
  return (
    <div className="min-h-screen bg-[#030303] flex">

      {/* ── Left panel (desktop only) ── */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] bg-[#060606] border-r border-neutral-800 p-12 bg-grid">
        {/* logo */}
        <Link href="/" className="flex items-center gap-2 text-white font-semibold text-xl">
          <Layers className="text-emerald-500" size={24} />
          GemPrism
        </Link>

        {/* centre copy */}
        <div>
          <h2 className="text-3xl font-bold text-white leading-snug mb-4">
            One token.<br />
            <span className="text-emerald-400">Unlimited throughput.</span>
          </h2>
          <p className="text-neutral-400 text-sm leading-relaxed mb-10 max-w-xs">
            Pool your Gemini API keys into a single, high-availability gateway and let
            GemPrism handle the rate limits for you.
          </p>

          <ul className="space-y-5">
            {PERKS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-neutral-300 text-sm">
                <span className="shrink-0 w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400">
                  <Icon size={16} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* footer note */}
        <p className="text-neutral-600 text-xs">
          Free to use · Open source · Not affiliated with Google
        </p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* mobile logo */}
        <Link href="/" className="flex items-center gap-2 text-white font-semibold text-xl mb-10 lg:hidden">
          <Layers className="text-emerald-500" size={24} />
          GemPrism
        </Link>

        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-1">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-neutral-500 text-sm mb-8">
            {isSignUp
              ? "Start routing Gemini API requests in minutes."
              : "Sign in to manage your gateway."}
          </p>

          <form onSubmit={handleAuth} className="flex flex-col gap-4" noValidate>
            {/* email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs text-neutral-400 font-medium">
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
                className="bg-[#0c0c0c] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
              />
            </div>

            {/* password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs text-neutral-400 font-medium">
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
                  className="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-emerald-500 text-white placeholder:text-neutral-600 rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* inline error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-red-400 text-xs leading-relaxed animate-fade-in">
                {error}
              </div>
            )}

            {/* submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              {loading
                ? <><span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" /> Please wait…</>
                : <>{isSignUp ? "Create account" : "Sign in"} <ArrowRight size={16} /></>}
            </button>
          </form>

          {/* toggle */}
          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(s => !s); setError(""); }}
              className="text-sm text-neutral-500 hover:text-white transition-colors"
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