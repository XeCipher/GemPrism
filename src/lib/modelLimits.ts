export const MODEL_ALIASES: Record<string, string> = {
  "gemini-flash-latest":      "gemini-3.5-flash",
  "gemini-flash-lite-latest": "gemini-3.1-flash-lite",
  "gemini-pro-latest":        "gemini-3.1-pro-preview"
};

/**
 * Intelligent degradation chains for 503 Overloaded fallback mechanism.
 * Flash falls back to older Flash, Lite to Lite, Pro to Pro.
 * Uses exact API model identifiers.
 */
export const MODEL_FALLBACKS: Record<string, string[]> = {
  "gemini-3.5-flash":           ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.0-flash"],
  "gemini-3-flash-preview":     ["gemini-2.5-flash", "gemini-2.0-flash"],
  "gemini-3.1-flash-lite":      ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"],
  "gemini-3.1-flash-lite-preview":["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"],
  "gemini-2.5-flash":           ["gemini-2.0-flash", "gemini-2.0-flash-001"],
  "gemini-2.5-flash-lite":      ["gemini-2.0-flash-lite", "gemini-2.0-flash-lite-001"],
  "gemini-3.1-pro-preview":     ["gemini-3-pro-preview", "gemini-2.5-pro"],
  "gemini-3-pro-preview":       ["gemini-2.5-pro"],
};

/**
 * Gemini API daily quotas reset at midnight Pacific Time (PT).
 * This translates to ~12:30 PM IST (07:00 UTC) during PDT and ~1:30 PM IST (08:00 UTC) during PST.
 * We format the current date strictly in the America/Los_Angeles timezone to perfectly align with Google's reset window.
 */
export function getQuotaResetDateStr(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  
  return `${year}-${month}-${day}`;
}

export const ALL_MODELS: Record<string, { name: string; rpm: number; rpd: number }> = {
  // Embeddings & AQA
  "gemini-embedding-001":                 { name: "Gemini Embedding 001",                         rpm:    100, rpd:   1000 },
  "gemini-embedding-2":                   { name: "Gemini Embedding 2",                           rpm:    100, rpd:   1000 },
  "gemini-embedding-2-preview":           { name: "Gemini Embedding 2 Preview",                   rpm:    100, rpd:   1000 },
  "aqa":                                  { name: "Attributed Question Answering",                rpm:      0, rpd:      0 },
  
  // Gemini 3.5 Generation
  "gemini-3.5-flash":                     { name: "Gemini 3.5 Flash",                             rpm:      5, rpd:     20 },

  // Gemini Omni
  "gemini-omni-flash-preview":            { name: "Gemini Omni Flash Preview",                    rpm:      5, rpd:     20 },

  // Gemini 3.1 Generation
  "gemini-3.1-flash-lite":                { name: "Gemini 3.1 Flash Lite",                        rpm:     15, rpd:    500 },
  "gemini-3.1-flash-lite-preview":        { name: "Gemini 3.1 Flash Lite Preview",                rpm:     15, rpd:    500 },
  "gemini-3.1-pro-preview":               { name: "Gemini 3.1 Pro Preview",                       rpm:      0, rpd:      0 },
  "gemini-3.1-pro-preview-customtools":   { name: "Gemini 3.1 Pro Preview Custom Tools",          rpm:      0, rpd:      0 },
  "gemini-3.1-flash-image":               { name: "Nano Banana 2",                                rpm:      0, rpd:      0 },
  "gemini-3.1-flash-image-preview":       { name: "Nano Banana 2 Preview",                        rpm:      0, rpd:      0 },
  "gemini-3.1-flash-lite-image":          { name: "Nano Banana 2 Lite",                           rpm:      0, rpd:      0 },
  "gemini-3.1-flash-tts-preview":         { name: "Gemini 3.1 Flash TTS Preview",                 rpm:      3, rpd:     10 },

  // Gemini 3 Generation
  "gemini-3-flash-preview":               { name: "Gemini 3 Flash Preview",                       rpm:      5, rpd:     20 },
  "gemini-3-pro-preview":                 { name: "Gemini 3 Pro Preview",                         rpm:      0, rpd:      0 },
  "gemini-3-pro-image":                   { name: "Nano Banana Pro",                              rpm:      0, rpd:      0 },
  "gemini-3-pro-image-preview":           { name: "Nano Banana Pro Preview",                      rpm:      0, rpd:      0 },
  "nano-banana-pro-preview":              { name: "Nano Banana Pro Preview (Alias)",              rpm:      0, rpd:      0 },

  // Gemini 2.5 Generation
  "gemini-2.5-flash":                     { name: "Gemini 2.5 Flash",                             rpm:      5, rpd:     20 },
  "gemini-2.5-flash-lite":                { name: "Gemini 2.5 Flash-Lite",                        rpm:     10, rpd:     20 },
  "gemini-2.5-pro":                       { name: "Gemini 2.5 Pro",                               rpm:      0, rpd:      0 },
  "gemini-2.5-flash-image":               { name: "Nano Banana",                                  rpm:      0, rpd:      0 },
  "gemini-2.5-flash-preview-tts":         { name: "Gemini 2.5 Flash Preview TTS",                 rpm:      3, rpd:     10 },
  "gemini-2.5-pro-preview-tts":           { name: "Gemini 2.5 Pro Preview TTS",                   rpm:      0, rpd:      0 },
  "gemini-2.5-flash-native-audio-latest": { name: "Gemini 2.5 Flash Native Audio Latest",         rpm: 999999, rpd: 999999 },
  "gemini-2.5-computer-use-preview-10-2025": { name: "Gemini 2.5 Computer Use Preview 10-2025",   rpm:      0, rpd:      0 },

  // Gemini 2.0 Generation
  "gemini-2.0-flash":                     { name: "Gemini 2.0 Flash",                             rpm:      0, rpd:      0 },
  "gemini-2.0-flash-001":                 { name: "Gemini 2.0 Flash 001",                         rpm:      0, rpd:      0 },
  "gemini-2.0-flash-lite":                { name: "Gemini 2.0 Flash-Lite",                        rpm:      0, rpd:      0 },
  "gemini-2.0-flash-lite-001":            { name: "Gemini 2.0 Flash-Lite 001",                    rpm:      0, rpd:      0 },

  // Robotics
  "gemini-robotics-er-1.5-preview":       { name: "Gemini Robotics-ER 1.5 Preview",               rpm:     10, rpd:     20 },
  "gemini-robotics-er-1.6-preview":       { name: "Gemini Robotics-ER 1.6 Preview",               rpm:      5, rpd:     20 },
  
  // Antigravity
  "antigravity-preview-05-2026":          { name: "Antigravity Agent Preview",                    rpm:      0, rpd:      0 },
  
  // Deep Research
  "deep-research-pro-preview-12-2025":    { name: "Deep Research Pro Preview (Dec-12-2025)",      rpm:      0, rpd:      0 },
  "deep-research-preview-04-2026":        { name: "Deep Research Preview (Apr-21-2026)",          rpm:      0, rpd:      0 },
  "deep-research-max-preview-04-2026":    { name: "Deep Research Max Preview (Apr-21-2026)",      rpm:      0, rpd:      0 },

  // Imagen
  "imagen-4.0-generate-001":              { name: "Imagen 4",                                     rpm: 999999, rpd:     25 },
  "imagen-4.0-ultra-generate-001":        { name: "Imagen 4 Ultra",                               rpm: 999999, rpd:     25 },
  "imagen-4.0-fast-generate-001":         { name: "Imagen 4 Fast",                                rpm: 999999, rpd:     25 },
  
  // Lyria
  "lyria-3-clip-preview":                 { name: "Lyria 3 Clip Preview",                         rpm:      0, rpd:      0 },
  "lyria-3-pro-preview":                  { name: "Lyria 3 Pro Preview",                          rpm:      0, rpd:      0 },

  // Veo
  "veo-3.1-generate-preview":             { name: "Veo 3.1",                                      rpm:      0, rpd:      0 },
  "veo-3.1-fast-generate-preview":        { name: "Veo 3.1 fast",                                 rpm:      0, rpd:      0 },
  "veo-3.1-lite-generate-preview":        { name: "Veo 3.1 lite",                                 rpm:      0, rpd:      0 },

  // Gemma
  "gemma-4-26b-a4b-it":                   { name: "Gemma 4 26B A4B IT",                           rpm:     15, rpd:   1500 },
  "gemma-4-31b-it":                       { name: "Gemma 4 31B IT",                               rpm:     15, rpd:   1500 },

  // API-exposed "latest" labels
  "gemini-flash-latest":                  { name: "Gemini Flash Latest",                          rpm:      5, rpd:     20 },
  "gemini-flash-lite-latest":             { name: "Gemini Flash-Lite Latest",                     rpm:     15, rpd:    500 },
  "gemini-pro-latest":                    { name: "Gemini Pro Latest",                            rpm:      0, rpd:      0 },

  // Default Fallback
  "default":                              { name: "Unknown Model (Fallback)",                     rpm:     15, rpd:   1500 }
};

const SORTED_MODEL_KEYS = Object.keys(ALL_MODELS).sort((a, b) => b.length - a.length);

export function getModelLimits(modelId: string) {
  let normalized = modelId.toLowerCase();

  // 1. Resolve Aliases explicitly
  if (MODEL_ALIASES[normalized]) {
    const canonicalId = MODEL_ALIASES[normalized];
    return { id: canonicalId, ...ALL_MODELS[canonicalId] };
  }

  // 2. Exact match in ALL_MODELS
  if (ALL_MODELS[normalized]) {
    return { id: normalized, ...ALL_MODELS[normalized] };
  }

  // 3. Strip -latest if trailing and attempt match again
  if (normalized.endsWith("-latest")) {
    const stripped = normalized.replace(/-latest$/, "");
    if (ALL_MODELS[stripped]) {
      return { id: stripped, ...ALL_MODELS[stripped] };
    }
  }

  // 4. Fuzzy / Contains match mapping based on longest specific string match first
  for (const key of SORTED_MODEL_KEYS) {
    if (normalized.includes(key)) {
      return { id: key, ...ALL_MODELS[key] };
    }
  }

  // 5. Hard Fallback
  return { id: "default", ...ALL_MODELS["default"] };
}