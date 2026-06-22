export const MODEL_ALIASES: Record<string, string> = {
  "gemini-flash-latest":      "gemini-3.5-flash",
  "gemini-flash-lite-latest": "gemini-3.1-flash-lite",
  "gemini-pro-latest":        "gemini-3.1-pro-preview"
};

export const ALL_MODELS: Record<string, { name: string; rpm: number; rpd: number }> = {
  // Embeddings
  "gemini-embedding-1":                   { name: "Gemini Embedding 1",                           rpm:    100, rpd:   1000 },
  "gemini-embedding-2":                   { name: "Gemini Embedding 2",                           rpm:    100, rpd:   1000 },
  
  // Gemini 3.5 Generation
  "gemini-3.5-flash":                     { name: "Gemini 3.5 Flash",                             rpm:      5, rpd:     20 },
  "gemini-3.5-live-translate-preview":    { name: "Gemini 3.5 Live Translate Preview",            rpm: 999999, rpd: 999999 },

  // Gemini 3.1 Generation
  "gemini-3.1-flash-lite":                { name: "Gemini 3.1 Flash Lite",                        rpm:     15, rpd:    500 },
  "gemini-3.1-pro-preview":               { name: "Gemini 3.1 Pro Preview",                       rpm:      0, rpd:      0 },
  "gemini-3.1-pro":                       { name: "Gemini 3.1 Pro",                               rpm:      0, rpd:      0 },
  "gemini-3.1-flash-image":               { name: "Nano Banana 2 (Gemini 3.1 Flash Image)",       rpm:      0, rpd:      0 },
  "gemini-3.1-flash-live-preview":        { name: "Gemini 3.1 Flash Live Preview",                rpm: 999999, rpd: 999999 },
  "gemini-3.1-flash-tts-preview":         { name: "Gemini 3.1 Flash TTS Preview",                 rpm:      3, rpd:     10 },
  "gemini-3.1-flash-tts":                 { name: "Gemini 3.1 Flash TTS",                         rpm:      3, rpd:     10 },

  // Gemini 3 Generation
  "gemini-3-flash-preview":               { name: "Gemini 3 Flash Preview",                       rpm:      5, rpd:     20 },
  "gemini-3-flash":                       { name: "Gemini 3 Flash",                               rpm:      5, rpd:     20 },
  "gemini-3-pro-image":                   { name: "Nano Banana Pro (Gemini 3 Pro Image)",         rpm:      0, rpd:      0 },
  "gemini-3-flash-live":                  { name: "Gemini 3 Flash Live",                          rpm: 999999, rpd: 999999 },

  // Gemini 2.5 Generation
  "gemini-2.5-flash":                     { name: "Gemini 2.5 Flash",                             rpm:      5, rpd:     20 },
  "gemini-2.5-flash-lite":                { name: "Gemini 2.5 Flash Lite",                        rpm:     10, rpd:     20 },
  "gemini-2.5-pro":                       { name: "Gemini 2.5 Pro",                               rpm:      0, rpd:      0 },
  "gemini-2.5-flash-image":               { name: "Nano Banana (Gemini 2.5 Flash Image)",         rpm:      0, rpd:      0 },
  "gemini-2.5-flash-preview-tts":         { name: "Gemini 2.5 Flash TTS Preview",                 rpm:      3, rpd:     10 },
  "gemini-2.5-flash-tts":                 { name: "Gemini 2.5 Flash TTS",                         rpm:      3, rpd:     10 },
  "gemini-2.5-pro-preview-tts":           { name: "Gemini 2.5 Pro TTS Preview",                   rpm:      0, rpd:      0 },
  "gemini-2.5-pro-tts":                   { name: "Gemini 2.5 Pro TTS",                           rpm:      0, rpd:      0 },
  "gemini-2.5-flash-native-audio-dialog": { name: "Gemini 2.5 Flash Native Audio Dialog",         rpm: 999999, rpd: 999999 },

  // Gemini 2 Generation
  "gemini-2-flash":                       { name: "Gemini 2 Flash",                               rpm:      0, rpd:      0 },
  "gemini-2-flash-lite":                  { name: "Gemini 2 Flash Lite",                          rpm:      0, rpd:      0 },

  // Robotics
  "gemini-robotics-er-1.5-preview":       { name: "Gemini Robotics ER 1.5 Preview",               rpm:     10, rpd:     20 },
  "gemini-robotics-er-1.6-preview":       { name: "Gemini Robotics ER 1.6 Preview",               rpm:      5, rpd:     20 },
  
  // Computer Use
  "computer-use-preview":                 { name: "Computer Use Preview",                         rpm:      0, rpd:      0 },

  // Antigravity
  "antigravity":                          { name: "Antigravity",                                  rpm:      0, rpd:      0 },
  "antigravity-preview-05-2026":          { name: "Antigravity Agent Preview",                    rpm:      0, rpd:      0 },
  
  // Deep Research
  "deep-research-pro-preview":            { name: "Deep Research Pro Preview",                    rpm:      0, rpd:      0 },
  "deep-research-preview-04-2026":        { name: "Deep Research Preview",                        rpm:      0, rpd:      0 },
  "deep-research-max-preview-04-2026":    { name: "Deep Research Max Preview",                    rpm:      0, rpd:      0 },

  // Imagen
  "imagen-4.0-generate-001":              { name: "Imagen 4 Generate 001",                        rpm: 999999, rpd:     25 },
  "imagen-4.0-ultra-generate-001":        { name: "Imagen 4 Ultra Generate 001",                  rpm: 999999, rpd:     25 },
  "imagen-4.0-fast-generate-001":         { name: "Imagen 4 Fast Generate 001",                   rpm: 999999, rpd:     25 },
  "imagen-4-generate":                    { name: "Imagen 4 Generate",                            rpm: 999999, rpd:     25 },
  "imagen-4-ultra-generate":              { name: "Imagen 4 Ultra Generate",                      rpm: 999999, rpd:     25 },
  "imagen-4-fast-generate":               { name: "Imagen 4 Fast Generate",                       rpm: 999999, rpd:     25 },
  
  // Lyria
  "lyria-3-clip-preview":                 { name: "Lyria 3 Clip Preview",                         rpm:      0, rpd:      0 },
  "lyria-3-pro-preview":                  { name: "Lyria 3 Pro Preview",                          rpm:      0, rpd:      0 },
  "lyria-3-clip":                         { name: "Lyria 3 Clip",                                 rpm:      0, rpd:      0 },
  "lyria-3-pro":                          { name: "Lyria 3 Pro",                                  rpm:      0, rpd:      0 },

  // Veo
  "veo-3.1-generate-preview":             { name: "Veo 3.1 Generate Preview",                     rpm:      0, rpd:      0 },
  "veo-3.1-fast-generate-preview":        { name: "Veo 3.1 Fast Generate Preview",                rpm:      0, rpd:      0 },
  "veo-3.1-lite-generate-preview":        { name: "Veo 3.1 Lite Generate Preview",                rpm:      0, rpd:      0 },
  "veo-3-generate":                       { name: "Veo 3 Generate",                               rpm:      0, rpd:      0 },
  "veo-3-fast-generate":                  { name: "Veo 3 Fast Generate",                          rpm:      0, rpd:      0 },
  "veo-3-lite-generate":                  { name: "Veo 3 Lite Generate",                          rpm:      0, rpd:      0 },
  "veo-2.0-generate-001":                 { name: "Veo 2 Generate 001",                           rpm:      0, rpd:      0 },

  // Gemma
  "gemma-4-26b-a4b-it":                   { name: "Gemma 4 26B A4B IT",                           rpm:     15, rpd:   1500 },
  "gemma-4-31b-it":                       { name: "Gemma 4 31B IT",                               rpm:     15, rpd:   1500 },
  "gemma-4-26b":                          { name: "Gemma 4 26B",                                  rpm:     15, rpd:   1500 },
  "gemma-4-31b":                          { name: "Gemma 4 31B",                                  rpm:     15, rpd:   1500 },

  // Legacy Aliases
  "nano-banana":                          { name: "Nano Banana (Gemini 2.5 Flash Image)",         rpm:      0, rpd:      0 },
  "nano-banana-pro":                      { name: "Nano Banana Pro (Gemini 3 Pro Image)",         rpm:      0, rpd:      0 },
  "nano-banana-2":                        { name: "Nano Banana 2 (Gemini 3.1 Flash Image)",       rpm:      0, rpd:      0 },

  "default":                              { name: "Unknown Model (Fallback)",                     rpm:     15, rpd:   1500 }
};

const SORTED_MODEL_KEYS = Object.keys(ALL_MODELS).sort((a, b) => b.length - a.length);

export function getModelLimits(modelId: string) {
  let normalized = modelId.toLowerCase();

  if (MODEL_ALIASES[normalized]) {
    const canonicalId = MODEL_ALIASES[normalized];
    return { id: canonicalId, ...ALL_MODELS[canonicalId] };
  }

  if (ALL_MODELS[normalized]) {
    return { id: normalized, ...ALL_MODELS[normalized] };
  }

  if (normalized.endsWith("-latest")) {
    normalized = normalized.replace(/-latest$/, "");
  }

  for (const key of SORTED_MODEL_KEYS) {
    if (normalized.includes(key)) {
      return { id: key, ...ALL_MODELS[key] };
    }
  }

  return { id: "default", ...ALL_MODELS["default"] };
}