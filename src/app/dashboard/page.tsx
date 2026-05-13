"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase";
import { Activity, ShieldAlert, Zap, ServerCrash, Copy, Check, Database, Plus, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push("/login");
      else setSession(session);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    const fetchStats = async () => {
      const res = await fetch("/api/admin/stats", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      if (res.ok) setData(await res.json());
      else if (res.status === 401) {
        await supabaseClient.auth.signOut();
        router.push("/login");
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [session, router]);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setIsAdding(true);
    
    const { error } = await supabaseClient.from('api_keys').insert({ 
      user_id: session.user.id, 
      key_value: newKey.trim() 
    });
    
    if (error) {
      alert("Failed to add key: " + error.message);
    } else {
      setNewKey("");
      // Force an immediate refresh
      const res = await fetch("/api/admin/stats", { headers: { "Authorization": `Bearer ${session.access_token}` }});
      if (res.ok) setData(await res.json());
    }
    setIsAdding(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-[#050505] text-emerald-500 flex flex-col gap-4 items-center justify-center font-mono">
        <Activity className="animate-pulse" size={32} />
        <p>Syncing Workspace...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-300 font-mono p-4 md:p-8 selection:bg-emerald-500/30 max-w-7xl mx-auto">
      <header className="mb-8 md:mb-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity className="text-emerald-500" />
          <h1 className="text-xl md:text-2xl text-white tracking-tight">GemPrism Dashboard</h1>
        </div>
        <button 
          onClick={() => supabaseClient.auth.signOut().then(() => router.push('/login'))} 
          className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors"
        >
          <LogOut size={16}/> Sign Out
        </button>
      </header>

      {/* Gateway Token Banner */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-lg mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-emerald-400 font-semibold mb-1 text-lg">Your Gateway Token</h3>
          <p className="text-neutral-400 text-sm">Use this exactly like a Google API Key in the official GenAI SDKs.</p>
        </div>
        <button 
          onClick={() => handleCopy(data.token)} 
          className="flex items-center gap-2 bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-600 px-4 py-2 rounded-md text-white transition-colors w-full md:w-auto justify-center"
        >
          <span className="truncate max-w-[200px] md:max-w-none">{data.token}</span> 
          {copiedId === data.token ? <Check size={16} className="text-emerald-500 shrink-0" /> : <Copy size={16} className="shrink-0"/>}
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Daily Volume", value: data.summary.total_requests, icon: Activity },
          { label: "Active Nodes", value: data.summary.active, icon: Zap },
          { label: "Cooling Nodes", value: data.summary.cooling, icon: ShieldAlert },
          { label: "Dead Nodes", value: data.summary.dead, icon: ServerCrash },
        ].map((s, i) => (
          <div key={i} className="bg-[#0a0a0a] border border-neutral-800 p-5 rounded-lg flex flex-col gap-2">
            <div className="flex justify-between items-center text-neutral-500 text-xs md:text-sm">
              {s.label} <s.icon size={16} />
            </div>
            <div className="text-2xl md:text-3xl text-white font-medium">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add New Key Form */}
      <form onSubmit={handleAddKey} className="flex flex-col md:flex-row gap-2 mb-12">
        <input 
          type="text" 
          placeholder="Paste Google Gemini API Key (AIzaSy...)" 
          value={newKey} 
          onChange={e => setNewKey(e.target.value)}
          className="flex-1 bg-[#0a0a0a] border border-neutral-800 text-white p-3 rounded-md outline-none focus:border-emerald-500 transition-colors" 
          required
        />
        <button 
          type="submit" 
          disabled={isAdding}
          className="bg-white text-black px-6 py-3 rounded-md font-medium hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Plus size={18}/> {isAdding ? "Adding..." : "Add Node"}
        </button>
      </form>

      {/* Nodes Table */}
      <h2 className="text-lg text-white mb-4 flex items-center gap-2"><ServerCrash size={18} className="text-neutral-500"/> Routing Nodes ({data.keys.length})</h2>
      <div className="bg-[#0a0a0a] border border-neutral-800 rounded-lg overflow-x-auto mb-12">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#111] border-b border-neutral-800 text-neutral-500">
            <tr>
              <th className="p-4 font-normal">Node ID</th>
              <th className="p-4 font-normal">Status</th>
              <th className="p-4 font-normal">RPM Load</th>
              <th className="p-4 font-normal">RPD Load</th>
              <th className="p-4 font-normal">Errors</th>
            </tr>
          </thead>
          <tbody>
            {data.keys.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-neutral-500">No keys added yet. Add your first Gemini key above.</td></tr>
            )}
            {data.keys.map((k: any) => (
              <tr key={k.id} className="border-b border-neutral-800/50 hover:bg-[#111] transition-colors">
                <td className="p-4 font-medium text-neutral-300">{k.key_value}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium tracking-wide ${
                    k.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-500' : 
                    k.status === 'cooling' ? 'bg-amber-500/10 text-amber-500' : 
                    'bg-red-500/10 text-red-500'
                  }`}>
                    {k.status.toUpperCase()}
                  </span>
                </td>
                <td className="p-4 text-neutral-400">{k.rpm_count} req/min</td>
                <td className="p-4 text-neutral-400">{k.rpd_count} req/day</td>
                <td className="p-4">
                  {k.total_errors > 0 ? (
                    <span className="text-red-400 border-b border-dashed border-red-400/30 pb-0.5 cursor-help" title={k.last_error || "Unknown Error"}>
                      {k.total_errors}
                    </span>
                  ) : (
                    <span className="text-neutral-600">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Global Model Stats Table */}
      <h2 className="text-lg text-white mb-4 flex items-center gap-2"><Database size={18} className="text-neutral-500"/> Model Telemetry & Registry</h2>
      <div className="bg-[#0a0a0a] border border-neutral-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#111] border-b border-neutral-800 text-neutral-500">
            <tr>
              <th className="p-4 font-normal">Model Name</th>
              <th className="p-4 font-normal">API Identifier</th>
              <th className="p-4 font-normal">RPD Free Tier Limit</th>
              <th className="p-4 font-normal text-right">Your Gateway Usage</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.models)
              .filter(([id]) => id !== "default")
              .map(([id, details]: [string, any]) => {
                const usage = data.usage[id] || 0;
                const isExhausted = details.rpd === 0;
                return (
                  <tr key={id} className={`border-b border-neutral-800/50 hover:bg-[#111] transition-colors ${isExhausted ? 'opacity-50' : ''}`}>
                    <td className="p-4 font-medium text-white">{details.name}</td>
                    <td className="p-4">
                      <button 
                        onClick={() => handleCopy(id)}
                        className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded-md text-neutral-400 transition-colors"
                        title="Copy API ID"
                      >
                        {id} 
                        {copiedId === id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-neutral-500"/>}
                      </button>
                    </td>
                    <td className="p-4 text-neutral-400">
                      {details.rpd === 999999 ? 'Unlimited' : details.rpd === 0 ? 'Waitlist / Unavailable' : `${details.rpd} req/day`}
                    </td>
                    <td className="p-4 text-right">
                      <span className={usage > 0 ? "text-emerald-400 font-medium" : "text-neutral-600"}>
                        {usage} calls
                      </span>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}