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

let cachedModels: string[] | null = null;
let lastFetchTime = 0;

export async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  if (cachedModels && Date.now() - lastFetchTime < 1000 * 60 * 60) {
    return cachedModels;
  }
  let fetched: string[] = [];
  if (apiKey) {
    try {
      // Dynamically fetch models directly from Google's API
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
  
  cachedModels = fetched;
  lastFetchTime = Date.now();
  return fetched;
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
  const parsedAvailable = availableModels.map(parseModel);
  
  // 1. Resolve "latest" aliases strictly dynamically against available versions returned by the API
  let resolvedId = requestedModel;
  if (requestedModel.includes('latest')) {
    let targetFamily = 'flash';
    if (requestedModel.includes('pro')) targetFamily = 'pro';
    if (requestedModel.includes('flash-lite')) targetFamily = 'flash-lite';
    
    const candidates = parsedAvailable.filter(m => m.family === targetFamily && !m.isAudio && !m.isImage && !m.isMusic);
    candidates.sort((a, b) => b.version - a.version); // Sort highest version first
    if (candidates.length > 0) resolvedId = candidates[0].id;
  }

  // Parse the final model we are attempting to use
  const req = parseModel(resolvedId);
  
  // 2. Do not attempt extreme model family degradation for complex multimodal architectures
  if (req.isAudio || req.isImage || req.isMusic || req.family === 'other' || req.family === 'gemma' || req.family === 'deep-research') {
    return [resolvedId];
  }

  const chain: string[] = [];
  
  const addFamily = (familyName: string, maxVersion: number = 999) => {
    // Only pull fallback models from the list that Google's API explicitly told us are available
    const models = parsedAvailable.filter(m => m.family === familyName && m.version <= maxVersion && !m.isAudio && !m.isImage && !m.isMusic);
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

  // 4. Force the requested model to be at index 0 definitively, even if Google didn't list it in /models
  const finalChain = chain.filter(id => id !== resolvedId);
  finalChain.unshift(resolvedId);

  return finalChain;
}