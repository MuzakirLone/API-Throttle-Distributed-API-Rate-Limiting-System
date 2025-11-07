import React, { useState } from "react";
import { motion } from "framer-motion";

export default function BackendDashboard() {
  const [endpoint, setEndpoint] = useState("/api/hello");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const callApi = async (burst = false) => {
    setLoading(true);
    setResult(null);
    try {
      if (!burst) {
        const r = await fetch(`http://localhost:3000${endpoint}`);
        const d = await r.json();
        setResult(d);
      } else {
        const arr = await Promise.all(
          [...Array(20)].map(() => fetch(`http://localhost:3000${endpoint}`).then(r => r.json()))
        );
        setResult(arr);
      }
    } catch (e) {
      setResult({ error: "API request failed" });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-neutral-900 to-black text-white p-10 flex flex-col items-center select-none">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-5xl font-extrabold mb-10 bg-white/10 backdrop-blur-xl px-10 py-4 rounded-3xl shadow-2xl border border-white/20"
      >
        X-API
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-4xl bg-white/10 backdrop-blur-2xl p-8 rounded-3xl shadow-[0_0_40px_rgba(255,255,255,0.15)] border border-white/20"
      >
        <div className="flex flex-col gap-4">
          <input
            className="w-full p-4 rounded-2xl bg-white/20 border border-white/30 focus:outline-none focus:ring-4 focus:ring-white/40 text-xl"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="Enter API Endpoint (e.g. /api/hello)"
          />

          <div className="flex gap-4 mt-2">
            <button
              onClick={() => callApi(false)}
              className="px-6 py-4 text-xl rounded-2xl bg-white/20 hover:bg-white/30 transition shadow-xl backdrop-blur-md"
            >
              Call API
            </button>
            <button
              onClick={() => callApi(true)}
              className="px-6 py-4 text-xl rounded-2xl bg-white/20 hover:bg-white/30 transition shadow-xl backdrop-blur-md"
            >
              Burst x20
            </button>
          </div>
        </div>

        <div className="mt-8 p-6 bg-black/40 rounded-3xl border border-white/20 h-[400px] overflow-auto text-lg whitespace-pre-wrap">
          {loading ? (
            <div className="text-white/60 animate-pulse text-center text-2xl">Calling API...</div>
          ) : result ? (
            JSON.stringify(result, null, 2)
          ) : (
            <span className="text-white/50">API Response will appear here...</span>
          )}
        </div>

        <div className="mt-6 text-center text-white/60 text-sm">Backend URL: http://localhost:3000</div>
      </motion.div>
    </div>
  );
}
