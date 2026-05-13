"use client";
import { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabase";
import { Zap, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  // Automatically redirect if session exists (e.g., after clicking email link)
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push("/dashboard");
    });

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) router.push("/dashboard");
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (isSignUp) {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        alert(error.message);
      } else {
        setCheckEmail(true); // Show the "Check Email" UI
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
      // Success is handled by the onAuthStateChange listener above
    }
    setLoading(false);
  };

  if (checkEmail) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-sans px-4">
        <div className="bg-[#0a0a0a] p-8 rounded-2xl border border-emerald-500/20 w-full max-w-md flex flex-col items-center gap-4 text-center">
          <div className="h-16 w-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-2">
            <MailCheck size={32} />
          </div>
          <h2 className="text-white text-2xl font-bold">Check your email</h2>
          <p className="text-neutral-400">
            We sent a verification link to <span className="text-white font-medium">{email}</span>. 
            Click the link to activate your account.
          </p>
          <button 
            onClick={() => setCheckEmail(false)} 
            className="mt-4 text-emerald-500 hover:text-emerald-400 text-sm font-medium transition-colors"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-sans px-4">
      <div className="bg-[#0a0a0a] p-8 rounded-2xl border border-neutral-800 w-full max-w-md flex flex-col gap-6 shadow-2xl">
        <div className="flex items-center gap-2 text-white text-2xl font-bold mb-2">
          <Zap className="text-emerald-500" size={28} /> GemPrism
        </div>
        
        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          <input 
            type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} 
            className="bg-[#111] border border-neutral-800 text-white p-3.5 rounded-lg outline-none focus:border-emerald-500 transition-colors w-full" 
            required 
          />
          <input 
            type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} 
            className="bg-[#111] border border-neutral-800 text-white p-3.5 rounded-lg outline-none focus:border-emerald-500 transition-colors w-full" 
            required 
          />
          <button 
            type="submit" disabled={loading}
            className="bg-emerald-500 text-black py-3.5 rounded-lg font-medium hover:bg-emerald-400 transition-colors mt-2 disabled:opacity-50"
          >
            {loading ? "Please wait..." : (isSignUp ? "Create Account" : "Sign In")}
          </button>
        </form>
        
        <button onClick={() => setIsSignUp(!isSignUp)} className="text-neutral-500 text-sm hover:text-white transition-colors">
          {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
      </div>
    </div>
  );
}