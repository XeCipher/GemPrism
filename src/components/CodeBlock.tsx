"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

function HighlightedLine({ line }: { line: string }) {
  // Comment styling
  if (line.trim().startsWith("//") || line.trim().startsWith("# ")) {
    return <span className="text-neutral-500 italic">{line}</span>;
  }

  const keyword = /\b(import|from|const|await|new|return|async|function)\b/g;
  const string = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  const prop = /\b(baseUrl|apiKey|model|contents)\b/g;

  let result = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  result = result.replace(string, (m) => `<em class="not-italic text-amber-300">${m}</em>`);
  result = result.replace(keyword, (m) => `<strong class="font-normal text-emerald-400">${m}</strong>`);
  result = result.replace(prop, (m) => `<span class="text-cyan-400">${m}</span>`);

  return <span dangerouslySetInnerHTML={{ __html: result }} />;
}

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative bg-[#070707] border border-neutral-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl w-full">
      {/* ── Titlebar ── */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-[#0a0a0a] border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-xs text-neutral-500 font-[family-name:var(--font-mono)] font-medium">app.ts</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-white transition-colors bg-neutral-900/50 hover:bg-neutral-800 px-2 py-1 rounded"
        >
          {copied ? (
            <>
              <Check size={13} className="text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* ── Code Content ── */}
      <div className="p-4 sm:p-6 overflow-x-auto w-full">
        <pre className="text-[11px] sm:text-xs md:text-sm leading-loose font-[family-name:var(--font-mono)] w-max min-w-full">
          {code.split("\n").map((line, i) => (
            <div key={i} className="flex gap-4">
              <span className="text-neutral-700 select-none w-4 sm:w-6 text-right shrink-0">
                {i + 1}
              </span>
              <HighlightedLine line={line} />
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}