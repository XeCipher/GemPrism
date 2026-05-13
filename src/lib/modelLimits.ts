export const MODEL_LIMITS: Record<string, { rpm: number; rpd: number; tpm: number }> = {
  "gemini-embedding-1": { rpm: 100, tpm: 30000, rpd: 1000 },
  "gemini-3-flash": { rpm: 5, tpm: 250000, rpd: 20 },
  "gemini-3.1-flash-lite": { rpm: 15, tpm: 250000, rpd: 500 },
  "gemini-2.5-flash": { rpm: 5, tpm: 250000, rpd: 20 },
  "gemini-2.5-flash-tts": { rpm: 3, tpm: 10000, rpd: 10 },
  "imagen-4-generate": { rpm: 15, tpm: 0, rpd: 25 },
  "gemma-4-26b": { rpm: 15, tpm: 1000000, rpd: 1500 },
  "gemma-4-31b": { rpm: 15, tpm: 1000000, rpd: 1500 },
  "gemini-2.5-flash-lite": { rpm: 10, tpm: 250000, rpd: 20 },
  "gemini-robotics-er-1.5-preview": { rpm: 10, tpm: 250000, rpd: 20 },
  "gemini-robotics-er-1.6-preview": { rpm: 5, tpm: 250000, rpd: 20 },
  "gemini-embedding-2": { rpm: 100, tpm: 30000, rpd: 1000 },
  "gemma-3-1b": { rpm: 30, tpm: 15000, rpd: 14400 },
  "gemma-3-2b": { rpm: 30, tpm: 15000, rpd: 14400 },
  "gemma-3-4b": { rpm: 30, tpm: 15000, rpd: 14400 },
  "gemma-3-12b": { rpm: 30, tpm: 15000, rpd: 14400 },
  "gemma-3-27b": { rpm: 30, tpm: 15000, rpd: 14400 },
  "default": { rpm: 15, tpm: 250000, rpd: 1500 }
};

export function getModelLimits(modelName: string) {
  const normalized = modelName.toLowerCase();
  for (const key in MODEL_LIMITS) {
    if (normalized.includes(key)) return MODEL_LIMITS[key];
  }
  return MODEL_LIMITS["default"];
}