// src/lib/modelLimits.ts

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

const SEED_MODELS = [
  "gemini-4-argon",
  "gemini-3.8-flash",
  "gemini-3.8-flash-tts",
  "gemini-3.5-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3.6-flash",
  "gemini-3.5-live-translate-preview",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-nano-banana-2.1",
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
  "gemini-3.5-transcribe",
  "gemini-2.5-flash-image",
  "gemini-robotics-er-2-preview",
  "gemini-3.8-live",
  "gemini-3.8-live-extended-thinking",
  "gemini-3.1-flash-live-preview",
  "gemini-3.5-transcribe-live",
  "gemini-robotics-er-2-streaming-preview",
  "gemini-3.8-flash-lite-tts",
  "gemini-3.1-flash-tts-preview",
  "lyria-3.5",
  "lyria-3-pro-preview",
  "lyria-3-clip-preview",
  "gemini-2.5-pro-preview-tts",
  "gemini-2.5-flash-preview-tts",
  "gemini-omni-1.2-flash",
  "gemini-omni-1.1-flash",
  "gemma-4-26b-a4b-it",
  "gemma-4-31b-it",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "antigravity-preview-09-2026",
  "deep-research-preview-04-2026",
  "deep-research-max-preview-04-2026"
];

let cachedModels: string[] | null = null;
let lastFetchTime = 0;

export async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  if (cachedModels && Date.now() - lastFetchTime < 1000 * 60 * 60) {
    return cachedModels;
  }
  let fetched: string[] = [];
  if (apiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models)) {
          fetched = data.models.map((m: any) => m.name.replace('models/', ''));
        }
      }
    } catch(e) {
      console.error("[GemPrism] Failed to fetch models from API:", e);
    }
  }
  // Merge live API fetch seamlessly with our predefined seeds (keeps unlisted models working)
  const unique = Array.from(new Set([...fetched, ...SEED_MODELS]));
  cachedModels = unique;
  lastFetchTime = Date.now();
  return unique;
}

export function parseModel(modelId: string) {
  let version = 1.0;
  const versionMatch = modelId.match(/(\d+\.\d+|\d+)/);
  if (versionMatch) version = parseFloat(versionMatch[1]);
  
  let family = 'other';
  if (modelId.includes('argon')) family = 'argon';
  else if (modelId.includes('pro')) family = 'pro';
  else if (modelId.includes('flash-lite')) family = 'flash-lite';
  else if (modelId.includes('flash')) family = 'flash';
  else if (modelId.includes('gemma')) family = 'gemma';
  else if (modelId.includes('deep-research')) family = 'deep-research';

  const isAudio = modelId.includes('tts') || modelId.includes('live') || modelId.includes('transcribe');
  const isImage = modelId.includes('image') || modelId.includes('banana') || modelId.includes('imagen') || modelId.includes('omni') || modelId.includes('veo');
  const isMusic = modelId.includes('lyria');

  return { id: modelId, version, family, isAudio, isImage, isMusic };
}

export function getFallbackChain(requestedModel: string, availableModels: string[]) {
  const parsedAll = availableModels.map(parseModel);
  
  // 1. Resolve "latest" aliases strictly dynamically against available versions
  let resolvedId = requestedModel;
  if (requestedModel.includes('latest')) {
    let targetFamily = 'flash';
    if (requestedModel.includes('pro')) targetFamily = 'pro';
    if (requestedModel.includes('flash-lite')) targetFamily = 'flash-lite';
    
    const candidates = parsedAll.filter(m => m.family === targetFamily && !m.isAudio && !m.isImage && !m.isMusic);
    candidates.sort((a, b) => b.version - a.version);
    if (candidates.length > 0) resolvedId = candidates[0].id;
  }

  const req = parseModel(resolvedId);
  
  // 2. Do not attempt extreme model family degradation for complex multimodal architectures
  if (req.isAudio || req.isImage || req.isMusic || req.family === 'other' || req.family === 'gemma' || req.family === 'deep-research') {
    return [resolvedId];
  }

  const chain: string[] = [];
  
  const addFamily = (familyName: string, maxVersion: number = 999) => {
    const models = parsedAll.filter(m => m.family === familyName && m.version <= maxVersion && !m.isAudio && !m.isImage && !m.isMusic);
    models.sort((a, b) => b.version - a.version);
    for (const m of models) {
      if (!chain.includes(m.id)) chain.push(m.id);
    }
  }

  // 3. Graceful degradation chain (Argon -> Pro -> Flash -> Lite) 
  // with strict enforcement down-chain
  if (req.family === 'argon') {
    addFamily('argon', req.version);
    addFamily('pro');
    addFamily('flash');
    addFamily('flash-lite');
  } else if (req.family === 'pro') {
    addFamily('pro', req.version);
    addFamily('flash');
    addFamily('flash-lite');
  } else if (req.family === 'flash') {
    addFamily('flash', req.version);
    addFamily('flash-lite');
  } else if (req.family === 'flash-lite') {
    addFamily('flash-lite', req.version);
  }

  // Insert target model at index 0 definitively to prevent mapping conflicts
  const finalChain = chain.filter(id => id !== resolvedId);
  finalChain.unshift(resolvedId);

  return finalChain;
}