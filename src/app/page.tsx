"use client";

import { useEffect, useState } from "react";
import { Activity, ShieldAlert, Zap, ServerCrash, Copy, Check, Database } from "lucide-react";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [token, setToken] = useState("");
  const [authOk, setAuthOk] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!authOk) return;
    const fetchStats = async () => {
      const res = await fetch("/api/admin/stats", {
        headers: { "X-Gateway-Token": token }
      });
      if (res.ok) setData(await res.json());
      else if (res.status === 401) setAuthOk(false);
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [authOk, token]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!authOk) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center font-mono">
        <div className="bg-[#111] p-8 rounded border border-neutral-800 w-96 flex flex-col gap-4">
          <Zap className="w-8 h-8 text-neutral-400" />
          <h1 className="text-white text-xl">GemPrism Gateway</h1>
          <input
            type="password"
            placeholder="Gateway Token"
            className="bg-black border border-neutral-800 text-white p-2 rounded outline-none focus:border-neutral-500"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            onClick={() => setAuthOk(true)}
            className="bg-white text-black px-4 py-2 rounded hover:bg-neutral-200 transition-colors"
          >
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  if (!data) return <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center font-mono">Syncing telemetry...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-300 font-mono p-8 selection:bg-neutral-800 max-w-7xl mx-auto">
      <header className="mb-12 flex items-center gap-3">
        <Activity className="text-emerald-500" />
        <h1 className="text-2xl text-white tracking-tight">GemPrism / Load Balancer</h1>
      </header>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Daily Volume", value: data.summary.total_requests, icon: Activity },
          { label: "Active Nodes", value: data.summary.active, icon: Zap },
          { label: "Cooling Nodes", value: data.summary.cooling, icon: ShieldAlert },
          { label: "Dead Nodes", value: data.summary.dead, icon: ServerCrash },
        ].map((s, i) => (
          <div key={i} className="bg-[#111] border border-neutral-800 p-5 rounded-lg flex flex-col gap-2">
            <div className="flex justify-between items-center text-neutral-500 text-sm">
              {s.label} <s.icon size={16} />
            </div>
            <div className="text-3xl text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Nodes Table */}
      <h2 className="text-lg text-white mb-4 flex items-center gap-2"><ServerCrash size={18}/> Routing Nodes</h2>
      <div className="bg-[#111] border border-neutral-800 rounded-lg overflow-hidden mb-12">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#161616] border-b border-neutral-800 text-neutral-500">
            <tr>
              <th className="p-4 font-normal">Node ID</th>
              <th className="p-4 font-normal">Status</th>
              <th className="p-4 font-normal">RPM Load</th>
              <th className="p-4 font-normal">RPD Load</th>
              <th className="p-4 font-normal">Last Active</th>
              <th className="p-4 font-normal">Errors</th>
            </tr>
          </thead>
          <tbody>
            {data.keys.map((k: any) => (
              <tr key={k.id} className="border-b border-neutral-800/50 hover:bg-[#161616]/50 transition-colors">
                <td className="p-4">•••{k.id.slice(-4)}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs ${
                    k.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-500' :
                    k.status === 'cooling' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-red-500/10 text-red-500'
                  }`}>
                    {k.status.toUpperCase()}
                  </span>
                </td>
                <td className="p-4">{k.rpm_count} req/min</td>
                <td className="p-4">{k.rpd_count} req/day</td>
                <td className="p-4">
                  {k.last_used === 0 ? 'Never' : `${Math.floor((Date.now() - k.last_used)/1000)}s ago`}
                </td>
                <td className="p-4">
                  {k.total_errors > 0 ? (
                    <span className="text-red-400 border-b border-dashed border-red-400/30 pb-0.5 cursor-help" title={k.last_error}>
                      {k.total_errors}
                    </span>
                  ) : "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Global Model Stats Table */}
      <h2 className="text-lg text-white mb-4 flex items-center gap-2"><Database size={18}/> Model Telemetry & Registry</h2>
      <div className="bg-[#111] border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#161616] border-b border-neutral-800 text-neutral-500">
            <tr>
              <th className="p-4 font-normal">Model Name</th>
              <th className="p-4 font-normal">API Identifier</th>
              <th className="p-4 font-normal">RPD Free Limit</th>
              <th className="p-4 font-normal text-right">Gateway Usage</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.models)
              .filter(([id]) => id !== "default")
              .map(([id, details]: [string, any]) => {
                const usage = data.usage[id] || 0;
                const isExhausted = details.rpd === 0;
              return (
                <tr key={id} className={`border-b border-neutral-800/50 hover:bg-[#161616]/50 transition-colors ${isExhausted ? 'opacity-40' : ''}`}>
                  <td className="p-4 font-medium text-white">{details.name}</td>
                  <td className="p-4">
                    <button 
                      onClick={() => handleCopy(id)}
                      className="flex items-center gap-2 bg-neutral-800/50 hover:bg-neutral-700/50 px-3 py-1.5 rounded-md text-neutral-300 transition-colors"
                      title="Copy API ID"
                    >
                      {id} 
                      {copiedId === id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-neutral-500"/>}
                    </button>
                  </td>
                  <td className="p-4">
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