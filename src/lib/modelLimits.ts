export const MODEL_ALIASES: Record<string, string> = {
  "gemini-flash-latest":      "gemini-3-flash",
  "gemini-flash-lite-latest": "gemini-3.1-flash-lite",
  "gemini-pro-latest":        "gemini-3.1-pro",
  "gemini-2.0-flash-latest":  "gemini-2-flash",
  "gemini-2.5-flash-latest":  "gemini-2.5-flash",
  "gemini-2.5-pro-latest":    "gemini-2.5-pro",
  "gemini-3.0-flash-latest":  "gemini-3-flash",
  "text-embedding-004":       "gemini-embedding-1"
};

export const ALL_MODELS: Record<string, { name: string; rpm: number; rpd: number }> = {
  "gemini-embedding-1":                   { name: "Gemini Embedding 1",                           rpm:    100, rpd:   1000 },
  "gemini-3-flash":                       { name: "Gemini 3 Flash",                               rpm:      5, rpd:     20 },
  "gemini-3.1-flash-lite":                { name: "Gemini 3.1 Flash Lite",                        rpm:     15, rpd:    500 },
  "gemini-2.5-flash":                     { name: "Gemini 2.5 Flash",                             rpm:      5, rpd:     20 },
  "gemini-2.5-pro":                       { name: "Gemini 2.5 Pro",                               rpm:      0, rpd:      0 },
  "gemini-2-flash":                       { name: "Gemini 2 Flash",                               rpm:      0, rpd:      0 },
  "gemini-2-flash-lite":                  { name: "Gemini 2 Flash Lite",                          rpm:      0, rpd:      0 },
  "gemini-2.5-flash-tts":                 { name: "Gemini 2.5 Flash TTS",                         rpm:      3, rpd:     10 },
  "gemini-2.5-pro-tts":                   { name: "Gemini 2.5 Pro TTS",                           rpm:      0, rpd:      0 },
  "imagen-4-generate":                    { name: "Imagen 4 Generate",                            rpm: 999999, rpd:     25 },
  "imagen-4-ultra-generate":              { name: "Imagen 4 Ultra Generate",                      rpm: 999999, rpd:     25 },
  "imagen-4-fast-generate":               { name: "Imagen 4 Fast Generate",                       rpm: 999999, rpd:     25 },
  "gemma-4-26b":                          { name: "Gemma 4 26B",                                  rpm:     15, rpd:   1500 },
  "gemma-4-31b":                          { name: "Gemma 4 31B",                                  rpm:     15, rpd:   1500 },
  "gemini-3.1-pro":                       { name: "Gemini 3.1 Pro",                               rpm:      0, rpd:      0 },
  "gemini-2.5-flash-lite":                { name: "Gemini 2.5 Flash Lite",                        rpm:     10, rpd:     20 },
  "nano-banana":                          { name: "Nano Banana (Gemini 2.5 Flash Preview Image)", rpm:      0, rpd:      0 },
  "nano-banana-pro":                      { name: "Nano Banana Pro (Gemini 3 Pro Image)",         rpm:      0, rpd:      0 },
  "nano-banana-2":                        { name: "Nano Banana 2 (Gemini 3.1 Flash Image)",       rpm:      0, rpd:      0 },
  "lyria-3-clip":                         { name: "Lyria 3 Clip",                                 rpm:      0, rpd:      0 },
  "lyria-3-pro":                          { name: "Lyria 3 Pro",                                  rpm:      0, rpd:      0 },
  "veo-3-generate":                       { name: "Veo 3 Generate",                               rpm:      0, rpd:      0 },
  "veo-3-fast-generate":                  { name: "Veo 3 Fast Generate",                          rpm:      0, rpd:      0 },
  "veo-3-lite-generate":                  { name: "Veo 3 Lite Generate",                          rpm:      0, rpd:      0 },
  "gemini-3.1-flash-tts":                 { name: "Gemini 3.1 Flash TTS",                         rpm:      3, rpd:     10 },
  "gemini-robotics-er-1.5-preview":       { name: "Gemini Robotics ER 1.5 Preview",               rpm:     10, rpd:     20 },
  "gemini-robotics-er-1.6-preview":       { name: "Gemini Robotics ER 1.6 Preview",               rpm:      5, rpd:     20 },
  "computer-use-preview":                 { name: "Computer Use Preview",                         rpm:      0, rpd:      0 },
  "gemini-embedding-2":                   { name: "Gemini Embedding 2",                           rpm:    100, rpd:   1000 },
  "deep-research-pro-preview":            { name: "Deep Research Pro Preview",                    rpm:      0, rpd:      0 },
  "gemini-2.5-flash-native-audio-dialog": { name: "Gemini 2.5 Flash Native Audio Dialog",         rpm: 999999, rpd: 999999 },
  "gemini-3-flash-live":                  { name: "Gemini 3 Flash Live",                          rpm: 999999, rpd: 999999 },
  "default":                              { name: "Unknown Model (Fallback)",                     rpm:     15, rpd:   1500 }
};

export function getModelLimits(modelId: string) {
  const normalized = modelId.toLowerCase();

  // 1. Explicit Alias Checking
  if (MODEL_ALIASES[normalized]) {
    const canonicalId = MODEL_ALIASES[normalized];
    return { id: canonicalId, ...ALL_MODELS[canonicalId] };
  }

  // 2. Substring Fallback Matching
  let bestMatchKey: string | null = null;
  
  for (const key in ALL_MODELS) {
    if (normalized.includes(key)) {
      if (!bestMatchKey || key.length > bestMatchKey.length) {
        bestMatchKey = key;
      }
    }
  }

  // Auto-strip trailing "-latest" if an explicit mapped alias wasn't found
  if (!bestMatchKey && normalized.endsWith("-latest")) {
    const stripped = normalized.replace("-latest", "");
    
    for (const key in ALL_MODELS) {
      if (stripped.includes(key)) {
        if (!bestMatchKey || key.length > bestMatchKey.length) {
          bestMatchKey = key;
        }
      }
    }
  }

  if (bestMatchKey) {
    return { id: bestMatchKey, ...ALL_MODELS[bestMatchKey] };
  }

  return { id: "default", ...ALL_MODELS["default"] };
}