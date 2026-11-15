export type ModelCategory =
  | "flash"
  | "flash-lite"
  | "pro"
  | "gemma"
  | "image"
  | "tts"
  | "live"
  | "media"
  | "embedding"
  | "specialized";

export interface RawGoogleModel {
  name: string;
  baseModelId?: string;
  version?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

export interface ModelCatalogItem {
  id: string;
  name: string;
  category: ModelCategory;
  description: string;
  versionParts: number[];
  tierWeight: number;
  isAlias: boolean;
  aliasTarget: string | null;
  isPreview: boolean;
  isPinnedRev: boolean;
  methods: string[];
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  source: "live" | "seed" | "historical";
}

export interface CatalogMetadata {
  source: "live" | "seed" | "empty";
  count: number;
  syncedAt: number;
}

export interface ModelDiscoveryResult {
  models: ModelCatalogItem[];
  meta: CatalogMetadata;
}

export interface ErrorClassification {
  kind:
    | "daily_exhausted"
    | "limit_zero"
    | "minute_rate_limit"
    | "balance_exhausted"
    | "dead_key"
    | "model_not_found"
    | "overloaded"
    | "server_error"
    | "client_error";
  cooldownMs: number;
  isDaily: boolean;
  reason: string;
}

export const CATEGORY_ORDER: ModelCategory[] = [
  "flash",
  "flash-lite",
  "pro",
  "gemma",
  "image",
  "tts",
  "live",
  "media",
  "embedding",
  "specialized",
];

export const CATEGORY_INFO: Record<
  ModelCategory,
  { label: string; shortLabel: string; badgeClass: string; colorHex: string; description: string }
> = {
  flash: {
    label: "Gemini Flash",
    shortLabel: "Flash",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    colorHex: "#10b981",
    description: "Fast, capable multimodal models for everyday and agentic workloads",
  },
  "flash-lite": {
    label: "Gemini Flash-Lite",
    shortLabel: "Flash-Lite",
    badgeClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25",
    colorHex: "#06b6d4",
    description: "High-throughput, cost-efficient models for scale",
  },
  pro: {
    label: "Gemini Pro & Frontier",
    shortLabel: "Pro / 4",
    badgeClass: "bg-violet-500/10 text-violet-400 border-violet-500/25",
    colorHex: "#8b5cf6",
    description: "Gemini 4 frontier series and high-reasoning Pro models",
  },
  gemma: {
    label: "Gemma Open Weights",
    shortLabel: "Gemma",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    colorHex: "#f59e0b",
    description: "Open-weight high-quota instruction-tuned models",
  },
  image: {
    label: "Image Generation",
    shortLabel: "Image",
    badgeClass: "bg-pink-500/10 text-pink-400 border-pink-500/25",
    colorHex: "#ec4899",
    description: "Nano Banana & Imagen visual generation and editing models",
  },
  tts: {
    label: "Text-to-Speech",
    shortLabel: "TTS",
    badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    colorHex: "#3b82f6",
    description: "Controllable multi-speaker speech synthesis models",
  },
  live: {
    label: "Live & Audio",
    shortLabel: "Live / Audio",
    badgeClass: "bg-teal-500/10 text-teal-400 border-teal-500/25",
    colorHex: "#14b8a6",
    description: "Real-time bidirectional voice, translation, and transcription",
  },
  media: {
    label: "Video & Music",
    shortLabel: "Media",
    badgeClass: "bg-orange-500/10 text-orange-400 border-orange-500/25",
    colorHex: "#f97316",
    description: "Omni generative video, Veo, and Lyria music synthesis",
  },
  embedding: {
    label: "Embeddings",
    shortLabel: "Embedding",
    badgeClass: "bg-lime-500/10 text-lime-400 border-lime-500/25",
    colorHex: "#84cc16",
    description: "Dense vector representation models for search and RAG",
  },
  specialized: {
    label: "Agents & Specialized",
    shortLabel: "Agents",
    badgeClass: "bg-neutral-500/10 text-neutral-300 border-neutral-600/40",
    colorHex: "#94a3b8",
    description: "Deep Research, Antigravity, Robotics, Decision, and utility models",
  },
};

/**
 * Gemini API daily quotas reset at midnight Pacific Time (America/Los_Angeles).
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

/**
 * Computes the exact epoch timestamp (ms) of the next midnight in America/Los_Angeles.
 * Handles PST/PDT transitions cleanly without external date libraries.
 */
export function getNextQuotaResetTimestampMs(nowMs: number = Date.now()): number {
  const startDate = getQuotaResetDateStr(new Date(nowMs));
  // Binary-search forward across the next 26 hours to pinpoint when PT date ticks over.
  let lo = nowMs + 1000;
  let hi = nowMs + 26 * 60 * 60 * 1000;

  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (getQuotaResetDateStr(new Date(mid)) === startDate) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return hi;
}

/**
 * Seed list used ONLY when a user has no working API keys yet or Google's model endpoint
 * is momentarily unreachable. Deliberately contains zero hardcoded rate limits.
 */
const SEED_MODEL_DEFS: Array<{ id: string; name: string; methods?: string[] }> = [
  { id: "gemini-flash-latest", name: "Gemini Flash Latest", methods: ["generateContent"] },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", methods: ["generateContent"] },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", methods: ["generateContent"] },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", methods: ["generateContent"] },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", methods: ["generateContent"] },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", methods: ["generateContent"] },

  { id: "gemini-flash-lite-latest", name: "Gemini Flash-Lite Latest", methods: ["generateContent"] },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", methods: ["generateContent"] },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", methods: ["generateContent"] },
  { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview", methods: ["generateContent"] },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", methods: ["generateContent"] },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash-Lite", methods: ["generateContent"] },

  { id: "gemini-pro-latest", name: "Gemini Pro Latest", methods: ["generateContent"] },
  { id: "gemini-4-carbon", name: "Gemini 4 Carbon", methods: ["generateContent"] },
  { id: "gemini-4-argon", name: "Gemini 4 Argon", methods: ["generateContent"] },
  { id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen", methods: ["generateContent"] },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", methods: ["generateContent"] },
  { id: "gemini-3.1-pro-preview-customtools", name: "Gemini 3.1 Pro Preview Custom Tools", methods: ["generateContent"] },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", methods: ["generateContent"] },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", methods: ["generateContent"] },

  { id: "gemma-4-31b-it", name: "Gemma 4 31B IT", methods: ["generateContent"] },
  { id: "gemma-4-26b-a4b-it", name: "Gemma 4 26B A4B IT", methods: ["generateContent"] },

  { id: "gemini-nano-banana-2.1", name: "Nano Banana 2.1", methods: ["generateContent"] },
  { id: "gemini-3.1-flash-image", name: "Nano Banana 2", methods: ["generateContent"] },
  { id: "gemini-3.1-flash-lite-image", name: "Nano Banana 2 Lite", methods: ["generateContent"] },
  { id: "gemini-3-pro-image", name: "Nano Banana Pro", methods: ["generateContent"] },
  { id: "gemini-2.5-flash-image", name: "Nano Banana", methods: ["generateContent"] },
  { id: "imagen-4.0-generate-001", name: "Imagen 4", methods: ["predict"] },
  { id: "imagen-4.0-ultra-generate-001", name: "Imagen 4 Ultra", methods: ["predict"] },
  { id: "imagen-4.0-fast-generate-001", name: "Imagen 4 Fast", methods: ["predict"] },

  { id: "gemini-3.8-flash-tts", name: "Gemini 3.8 Flash TTS", methods: ["generateContent"] },
  { id: "gemini-3.8-flash-lite-tts", name: "Gemini 3.8 Flash Lite TTS", methods: ["generateContent"] },
  { id: "gemini-3.1-flash-tts-preview", name: "Gemini 3.1 Flash TTS Preview", methods: ["generateContent"] },
  { id: "gemini-2.5-flash-preview-tts", name: "Gemini 2.5 Flash Preview TTS", methods: ["generateContent"] },
  { id: "gemini-2.5-pro-preview-tts", name: "Gemini 2.5 Pro Preview TTS", methods: ["generateContent"] },

  { id: "gemini-3.8-live", name: "Gemini 3.8 Live", methods: ["bidiGenerateContent", "generateContent"] },
  { id: "gemini-3.8-live-extended-thinking", name: "Gemini 3.8 Live Extended Thinking", methods: ["bidiGenerateContent", "generateContent"] },
  { id: "gemini-3.1-flash-live-preview", name: "Gemini 3.1 Flash Live Preview", methods: ["bidiGenerateContent", "generateContent"] },
  { id: "gemini-3.5-live-translate-preview", name: "Gemini 3.5 Live Translate Preview", methods: ["bidiGenerateContent", "generateContent"] },
  { id: "gemini-3.5-transcribe", name: "Gemini 3.5 Transcribe", methods: ["generateContent"] },
  { id: "gemini-3.5-transcribe-live", name: "Gemini 3.5 Transcribe Live", methods: ["bidiGenerateContent"] },
  { id: "gemini-2.5-flash-native-audio-latest", name: "Gemini 2.5 Flash Native Audio Latest", methods: ["bidiGenerateContent"] },

  { id: "gemini-omni-1.2-flash", name: "Gemini Omni 1.2 Flash", methods: ["generateContent"] },
  { id: "gemini-omni-1.1-flash", name: "Gemini Omni 1.1 Flash", methods: ["generateContent"] },
  { id: "lyria-3.5", name: "Lyria 3.5", methods: ["predict"] },
  { id: "lyria-3-pro-preview", name: "Lyria 3 Pro Preview", methods: ["predict"] },
  { id: "lyria-3-clip-preview", name: "Lyria 3 Clip Preview", methods: ["predict"] },
  { id: "veo-3.1-generate-preview", name: "Veo 3.1", methods: ["predictLongRunning"] },
  { id: "veo-3.1-fast-generate-preview", name: "Veo 3.1 Fast", methods: ["predictLongRunning"] },
  { id: "veo-3.1-lite-generate-preview", name: "Veo 3.1 Lite", methods: ["predictLongRunning"] },

  { id: "gemini-embedding-2", name: "Gemini Embedding 2", methods: ["embedContent"] },
  { id: "gemini-embedding-2-preview", name: "Gemini Embedding 2 Preview", methods: ["embedContent"] },
  { id: "gemini-embedding-001", name: "Gemini Embedding 001", methods: ["embedContent"] },

  { id: "gemini-decision-1", name: "Gemini Decision 1", methods: ["generateContent"] },
  { id: "gemini-robotics-er-2-preview", name: "Gemini Robotics-ER 2 Preview", methods: ["generateContent"] },
  { id: "gemini-robotics-er-2-streaming-preview", name: "Gemini Robotics-ER 2 Streaming Preview", methods: ["generateContent"] },
  { id: "antigravity-preview-09-2026", name: "Antigravity Agent Preview", methods: ["generateContent"] },
  { id: "deep-research-preview-04-2026", name: "Deep Research Preview", methods: ["generateContent"] },
  { id: "deep-research-max-preview-04-2026", name: "Deep Research Max Preview", methods: ["generateContent"] },
  { id: "gemini-2.5-computer-use-preview-10-2025", name: "Gemini 2.5 Computer Use Preview", methods: ["generateContent"] },
];

// Global cache shared across route invocations in the same Node process
const CACHE_TTL_MS = 15 * 60 * 1000;
const globalCacheStore = globalThis as typeof globalThis & {
  __gemprismCatalogCache?: Map<string, { models: ModelCatalogItem[]; syncedAt: number }>;
};

function getCatalogCache() {
  if (!globalCacheStore.__gemprismCatalogCache) {
    globalCacheStore.__gemprismCatalogCache = new Map();
  }
  return globalCacheStore.__gemprismCatalogCache;
}

function cleanModelId(rawName: string): string {
  return rawName.replace(/^models\//i, "").trim().toLowerCase();
}

function formatDisplayName(id: string): string {
  return id
    .split("-")
    .map((part) => {
      if (part === "tts") return "TTS";
      if (part === "it") return "IT";
      if (part === "er") return "ER";
      if (part === "aqa") return "AQA";
      if (/^\d+(\.\d+)?b$/i.test(part)) return part.toUpperCase();
      if (/^a\d+b$/i.test(part)) return part.toUpperCase();
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function detectCategory(id: string, methods: string[] = []): ModelCategory {
  if (
    id.includes("embedding") ||
    (methods.length > 0 &&
      methods.every((m) => m.toLowerCase().includes("embed")))
  ) {
    return "embedding";
  }
  if (id.includes("-tts") || id.endsWith("tts")) return "tts";
  if (id.includes("-image") || id.includes("nano-banana") || id.startsWith("imagen-")) {
    return "image";
  }
  if (
    id.includes("live") ||
    id.includes("transcribe") ||
    id.includes("native-audio") ||
    (methods.includes("bidiGenerateContent") && !methods.includes("generateContent"))
  ) {
    return "live";
  }
  if (id.includes("omni") || id.startsWith("veo-") || id.startsWith("lyria-")) {
    return "media";
  }
  if (
    id.includes("antigravity") ||
    id.includes("deep-research") ||
    id.includes("robotics") ||
    id.includes("decision") ||
    id.includes("computer-use") ||
    id === "aqa" ||
    id.includes("bison") ||
    id.includes("gecko")
  ) {
    return "specialized";
  }
  if (id.startsWith("gemma")) return "gemma";
  if (id.includes("flash-lite")) return "flash-lite";
  if (id.includes("flash")) return "flash";
  if (
    id.includes("pro") ||
    id.startsWith("gemini-4") ||
    id.startsWith("gemini-5") ||
    id.startsWith("gemini-")
  ) {
    return "pro";
  }
  return "specialized";
}

function extractVersionAndTier(id: string, category: ModelCategory): { versionParts: number[]; tierWeight: number } {
  // Match standard model version patterns like gemini-3.8-flash, gemma-4-31b-it, lyria-3.5, gemini-4-carbon
  let major = 0;
  let minor = 0;
  let patch = 0;

  // Special handling for nano-banana versions so 2.1 ranks right alongside newer image models
  const nanoMatch = id.match(/nano-banana-(\d+)(?:\.(\d+))?/);
  if (nanoMatch) {
    major = Number(nanoMatch[1]) + 2; // 2.1 -> 4.1 so Nano Banana 2.1 > 3.1-flash-image
    minor = Number(nanoMatch[2] || 0);
  } else {
    const verMatch = id.match(/(?:gemini|gemma|imagen|lyria|veo|omni|robotics-er|decision)[a-z-]*?-(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (verMatch) {
      major = Number(verMatch[1] || 0);
      minor = Number(verMatch[2] || 0);
      patch = Number(verMatch[3] || 0);
    }
  }

  // Extract parameter size (e.g. gemma-4-31b-it -> 31, gemma-4-26b -> 26)
  let paramSize = 0;
  const paramMatch = id.match(/-(\d+)b(?:-|$)/);
  if (paramMatch) {
    paramSize = Number(paramMatch[1]);
  }

  // Tier ordering within the same version (higher = stronger / flagship)
  let tierWeight = paramSize;
  if (id.includes("ultra")) tierWeight += 50;
  if (id.includes("carbon")) tierWeight += 40;
  if (id.includes("argon")) tierWeight += 30;
  if (id.includes("pro")) tierWeight += 25;
  if (id.includes("hydrogen")) tierWeight += 15;
  if (category === "flash") tierWeight += 12;
  if (category === "flash-lite") tierWeight += 6;
  if (id.includes("max")) tierWeight += 15;
  if (id.includes("customtools")) tierWeight -= 1;
  if (id.includes("extended-thinking")) tierWeight += 2;
  if (id.includes("fast")) tierWeight -= 2;
  if (id.includes("lite") && category === "image") tierWeight -= 5;
  if (id.includes("clip")) tierWeight -= 5;

  return {
    versionParts: [major, minor, patch],
    tierWeight,
  };
}

function inferMethodsByCategory(category: ModelCategory, id: string): string[] {
  if (category === "embedding") return ["embedContent"];
  if (category === "live") {
    return id.includes("transcribe") && !id.includes("live")
      ? ["generateContent"]
      : ["bidiGenerateContent", "generateContent"];
  }
  if (category === "media") {
    if (id.startsWith("veo-")) return ["predictLongRunning"];
    if (id.startsWith("lyria-")) return ["predict"];
    return ["generateContent"];
  }
  if (category === "image" && id.startsWith("imagen-")) return ["predict"];
  return ["generateContent"];
}

export function classifyModel(
  modelId: string,
  raw?: RawGoogleModel | null,
  source: "live" | "seed" | "historical" = "live"
): ModelCatalogItem {
  const id = cleanModelId(modelId);
  const methods = raw?.supportedGenerationMethods?.length
    ? raw.supportedGenerationMethods
    : [];
  const category = detectCategory(id, methods);
  const resolvedMethods = methods.length > 0 ? methods : inferMethodsByCategory(category, id);
  const { versionParts, tierWeight } = extractVersionAndTier(id, category);

  const isLatestSuffix = id.endsWith("-latest");
  const isGenericAlias =
    id === "gemini-flash-latest" ||
    id === "gemini-flash-lite-latest" ||
    id === "gemini-pro-latest" ||
    (isLatestSuffix && !id.includes("native-audio"));

  // Check if Google explicitly provided baseModelId or "Points to <model>" in description
  let explicitAliasTarget: string | null = null;
  if (raw?.baseModelId) {
    const cleanedBase = cleanModelId(raw.baseModelId);
    if (cleanedBase && cleanedBase !== id) {
      explicitAliasTarget = cleanedBase;
    }
  }
  if (!explicitAliasTarget && raw?.description) {
    const pointsMatch = raw.description.match(/(?:points to|alias (?:to|for))\s+(?:models\/)?([a-z0-9._-]+)/i);
    if (pointsMatch?.[1]) {
      explicitAliasTarget = cleanModelId(pointsMatch[1]);
    }
  }

  return {
    id,
    name: raw?.displayName?.trim() || formatDisplayName(id),
    category,
    description: raw?.description?.trim() || "",
    versionParts,
    tierWeight,
    isAlias: isGenericAlias || Boolean(explicitAliasTarget),
    aliasTarget: explicitAliasTarget,
    isPreview: id.includes("-preview") || id.includes("-exp"),
    isPinnedRev: /-\d{3}$/.test(id) || /-\d{2}-\d{4}$/.test(id),
    methods: resolvedMethods,
    inputTokenLimit: raw?.inputTokenLimit ?? null,
    outputTokenLimit: raw?.outputTokenLimit ?? null,
    source,
  };
}

function compareVersionsDesc(a: ModelCatalogItem, b: ModelCatalogItem): number {
  const len = Math.max(a.versionParts.length, b.versionParts.length);
  for (let i = 0; i < len; i++) {
    const va = a.versionParts[i] || 0;
    const vb = b.versionParts[i] || 0;
    if (va !== vb) return vb - va;
  }
  return 0;
}

/**
 * Deterministic sorting used both for UI catalog display and fallback sequencing:
 * 1. Category order (Flash -> Flash-Lite -> Pro/4 -> Gemma -> Image -> TTS -> Live -> Media -> Embedding -> Specialized)
 * 2. -latest aliases first within their category for quick discovery
 * 3. Highest semantic version first (e.g. 4.0 > 3.8 > 3.6 > 3.5 > 3.1 > 3.0 > 2.5)
 * 4. Higher tier weight first (Carbon > Argon > Hydrogen; 31B > 26B)
 * 5. Stable releases before preview/pinned revisions
 */
export function compareModelsInCatalog(a: ModelCatalogItem, b: ModelCatalogItem): number {
  const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  if (catDiff !== 0) return catDiff;

  if (a.isAlias !== b.isAlias) return a.isAlias ? -1 : 1;

  const verDiff = compareVersionsDesc(a, b);
  if (verDiff !== 0) return verDiff;

  if (a.tierWeight !== b.tierWeight) return b.tierWeight - a.tierWeight;
  if (a.isPreview !== b.isPreview) return a.isPreview ? 1 : -1;
  if (a.isPinnedRev !== b.isPinnedRev) return a.isPinnedRev ? 1 : -1;

  return a.id.localeCompare(b.id);
}

/**
 * Resolves `-latest` aliases dynamically against the live model catalog.
 */
export function resolveModelAlias(
  requestedModelId: string,
  catalog: ModelCatalogItem[]
): ModelCatalogItem {
  const cleaned = cleanModelId(requestedModelId);
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const existing = byId.get(cleaned) || classifyModel(cleaned, null, "live");

  // 1. Trust explicit alias target if present in live catalog
  if (existing.aliasTarget && byId.has(existing.aliasTarget)) {
    return byId.get(existing.aliasTarget)!;
  }

  // 2. Handle -latest dynamic resolution
  if (cleaned.endsWith("-latest")) {
    const stripped = cleaned.replace(/-latest$/, "");
    if (byId.has(stripped) && !byId.get(stripped)!.isAlias) {
      return byId.get(stripped)!;
    }

    // Match non-alias candidates in the same category/family
    const candidates = catalog
      .filter((m) => {
        if (m.isAlias || m.id.endsWith("-latest")) return false;
        if (cleaned === "gemini-pro-latest") {
          return m.category === "pro" && m.id.includes("pro") && !m.id.includes("customtools");
        }
        if (cleaned === "gemini-flash-latest") {
          return m.category === "flash";
        }
        if (cleaned === "gemini-flash-lite-latest") {
          return m.category === "flash-lite";
        }
        return m.category === existing.category;
      })
      .sort((a, b) => {
        const verDiff = compareVersionsDesc(a, b);
        if (verDiff !== 0) return verDiff;
        if (a.isPreview !== b.isPreview) return a.isPreview ? 1 : -1;
        if (a.isPinnedRev !== b.isPinnedRev) return a.isPinnedRev ? 1 : -1;
        return b.tierWeight - a.tierWeight;
      });

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return existing;
}

/**
 * Hydrates `aliasTarget` across all `-latest` items in a catalog so the UI can display
 * what each alias currently points to.
 */
function hydrateCatalogAliases(models: ModelCatalogItem[]): ModelCatalogItem[] {
  return models.map((item) => {
    if (!item.isAlias) return item;
    const target = resolveModelAlias(item.id, models);
    if (target.id !== item.id) {
      return { ...item, aliasTarget: target.id };
    }
    return item;
  });
}

async function fetchModelsFromGoogle(apiKey: string): Promise<RawGoogleModel[]> {
  const collected: RawGoogleModel[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 5; page++) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(5500),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Google models API returned ${res.status}`);
    }

    const json = (await res.json()) as {
      models?: RawGoogleModel[];
      nextPageToken?: string;
    };

    if (Array.isArray(json.models)) {
      collected.push(...json.models);
    }

    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return collected;
}

/**
 * Fetches all available models dynamically from Google Gemini API using the user's keys.
 * Falls back cleanly to cached or seed models if the user has no active keys yet.
 */
export async function discoverModelsForKeys(
  keys: Array<{ id?: string; key_value: string; status?: string }>,
  options: {
    userId?: string;
    forceRefresh?: boolean;
    historicalModelIds?: string[];
  } = {}
): Promise<ModelDiscoveryResult> {
  const cacheKey = options.userId || "__global__";
  const cache = getCatalogCache();
  const cached = cache.get(cacheKey);
  const now = Date.now();

  let baseModels: ModelCatalogItem[] | null = null;
  let source: "live" | "seed" | "empty" = "seed";
  let syncedAt = now;

  if (!options.forceRefresh && cached && now - cached.syncedAt < CACHE_TTL_MS) {
    baseModels = cached.models;
    source = "live";
    syncedAt = cached.syncedAt;
  } else {
    // Prioritize healthy keys first, then cooling keys (since /models list doesn't burn generation quota)
    const candidateKeys = [
      ...keys.filter((k) => k.status === "healthy" || !k.status),
      ...keys.filter((k) => k.status === "cooling"),
    ];

    for (const key of candidateKeys) {
      if (!key.key_value) continue;
      try {
        const rawModels = await fetchModelsFromGoogle(key.key_value);
        if (rawModels.length > 0) {
          baseModels = rawModels
            .filter((m) => Boolean(m.name))
            .map((m) => classifyModel(m.name, m, "live"));
          source = "live";
          syncedAt = now;
          cache.set(cacheKey, { models: baseModels, syncedAt });
          break;
        }
      } catch {
        // Try next key silently
      }
    }
  }

  // Fallback to stale cache if live fetch failed temporarily
  if (!baseModels && cached) {
    baseModels = cached.models;
    source = "live";
    syncedAt = cached.syncedAt;
  }

  // Fallback to seed catalog only if user has 0 working keys yet
  if (!baseModels) {
    baseModels = SEED_MODEL_DEFS.map((s) =>
      classifyModel(s.id, { name: s.id, displayName: s.name, supportedGenerationMethods: s.methods }, "seed")
    );
    source = keys.length === 0 ? "seed" : "empty";
  }

  // Merge any historical model IDs recorded in Supabase telemetry so past charts never lose metadata
  const map = new Map<string, ModelCatalogItem>();
  for (const model of baseModels) {
    map.set(model.id, model);
  }
  for (const histId of options.historicalModelIds || []) {
    const cleaned = cleanModelId(histId);
    if (!cleaned || cleaned.startsWith("__cooldown:") || cleaned === "default") continue;
    if (!map.has(cleaned)) {
      map.set(cleaned, classifyModel(cleaned, null, "historical"));
    }
  }

  const hydrated = hydrateCatalogAliases(Array.from(map.values())).sort(compareModelsInCatalog);

  return {
    models: hydrated,
    meta: {
      source,
      count: hydrated.length,
      syncedAt,
    },
  };
}

function isActionCompatible(model: ModelCatalogItem, requiredMethod: string | null): boolean {
  if (!requiredMethod) return true;
  if (requiredMethod === "streamGenerateContent" || requiredMethod === "countTokens") {
    return model.methods.includes("generateContent") || model.methods.includes(requiredMethod);
  }
  return model.methods.includes(requiredMethod);
}

/**
 * Constructs an intelligent cascading fallback chain for ANY requested model.
 * - Text requests stay in compatible text models and cascade from stronger/requested -> older same tier ->
 *   lighter tier (Flash-Lite) -> efficient frontier (Gemini 4 Hydrogen) -> Pro -> Gemma open weights.
 * - Image, TTS, Live, Media, and Embedding requests cascade strictly within their own modality.
 */
export function buildModelFallbackChain(
  requestedModelId: string,
  catalog: ModelCatalogItem[],
  action: string | null = "generateContent"
): string[] {
  const resolved = resolveModelAlias(requestedModelId, catalog);
  const startId = resolved.id;

  const nonAliasModels = catalog.filter(
    (m) =>
      !m.isAlias &&
      !m.id.includes("bison") &&
      !m.id.includes("gecko") &&
      m.id !== "aqa" &&
      isActionCompatible(m, action)
  );

  const byCategory = (cat: ModelCategory) =>
    nonAliasModels
      .filter((m) => m.category === cat)
      .sort(compareModelsInCatalog);

  // Determine how a model ranks relative to the start model inside its own category
  const sortDescendingFromStart = (items: ModelCatalogItem[], target: ModelCatalogItem) => {
    const equalOrLower: ModelCatalogItem[] = [];
    const higher: ModelCatalogItem[] = [];

    for (const item of items) {
      if (item.id === target.id) continue;
      const cmp = compareModelsInCatalog(item, target);
      // In compareModelsInCatalog, higher/newer items sort BEFORE target (cmp < 0)
      if (cmp >= 0) {
        equalOrLower.push(item);
      } else {
        higher.push(item);
      }
    }

    return { equalOrLower, higher };
  };

  const chain: string[] = [startId];
  const seen = new Set<string>([startId]);
  const pushUnique = (items: ModelCatalogItem[]) => {
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        chain.push(item.id);
      }
    }
  };

  const cat = resolved.category;

  if (cat === "flash") {
    const allFlash = byCategory("flash");
    const { equalOrLower, higher } = sortDescendingFromStart(allFlash, resolved);
    const allLite = byCategory("flash-lite");
    const allPro = byCategory("pro");
    // Put efficient Gemini 4 Hydrogen first among frontier/pro models since it carries free-tier quota
    const efficientPro = allPro.filter((m) => m.id.includes("hydrogen"));
    const remainingPro = allPro.filter((m) => !m.id.includes("hydrogen"));
    const allGemma = byCategory("gemma");

    pushUnique(equalOrLower);
    pushUnique(allLite);
    pushUnique(efficientPro);
    pushUnique(higher);
    pushUnique(remainingPro);
    pushUnique(allGemma);
  } else if (cat === "flash-lite") {
    const allLite = byCategory("flash-lite");
    const { equalOrLower, higher } = sortDescendingFromStart(allLite, resolved);
    const allFlash = byCategory("flash");
    const allPro = byCategory("pro");
    const efficientPro = allPro.filter((m) => m.id.includes("hydrogen"));
    const allGemma = byCategory("gemma");

    pushUnique(equalOrLower);
    pushUnique(higher);
    pushUnique(allFlash);
    pushUnique(efficientPro);
    pushUnique(allGemma);
  } else if (cat === "pro") {
    const allPro = byCategory("pro");
    const { equalOrLower, higher } = sortDescendingFromStart(allPro, resolved);
    const allFlash = byCategory("flash");
    const allLite = byCategory("flash-lite");
    const allGemma = byCategory("gemma");

    pushUnique(equalOrLower);
    pushUnique(allFlash);
    pushUnique(allLite);
    pushUnique(higher);
    pushUnique(allGemma);
  } else if (cat === "gemma") {
    const allGemma = byCategory("gemma");
    const { equalOrLower, higher } = sortDescendingFromStart(allGemma, resolved);
    const allLite = byCategory("flash-lite");
    const allFlash = byCategory("flash");

    pushUnique(equalOrLower);
    pushUnique(higher);
    pushUnique(allLite);
    pushUnique(allFlash);
  } else if (cat === "media") {
    // Keep Omni, Lyria, and Veo inside their respective sub-families
    const prefix = startId.startsWith("veo")
      ? "veo"
      : startId.startsWith("lyria")
        ? "lyria"
        : "omni";
    const familyMedia = byCategory("media").filter((m) => m.id.includes(prefix));
    const { equalOrLower, higher } = sortDescendingFromStart(familyMedia, resolved);
    pushUnique(equalOrLower);
    pushUnique(higher);
  } else {
    // image, tts, live, embedding, specialized: stay inside same modality
    const sameCat = byCategory(cat);
    const { equalOrLower, higher } = sortDescendingFromStart(sameCat, resolved);
    pushUnique(equalOrLower);
    pushUnique(higher);
  }

  return chain.slice(0, 20);
}

/**
 * Parses Google Gemini API error payloads to determine exact cooldown duration & recovery strategy
 * without relying on any hardcoded rate-limit tables.
 */
export function classifyErrorResponse(
  status: number,
  bodyText: string,
  nowMs: number = Date.now()
): ErrorClassification {
  const lower = bodyText.toLowerCase();

  if (status === 403 || status === 401) {
    return {
      kind: "dead_key",
      cooldownMs: 0,
      isDaily: false,
      reason: `API Key Rejected (${status})`,
    };
  }

  if (status === 402) {
    return {
      kind: "balance_exhausted",
      cooldownMs: 60 * 60 * 1000,
      isDaily: false,
      reason: "402 Prepay balance exhausted",
    };
  }

  if (status === 404) {
    return {
      kind: "model_not_found",
      cooldownMs: 0,
      isDaily: false,
      reason: "404 Model not found or deprecated",
    };
  }

  if (status === 503) {
    return {
      kind: "overloaded",
      cooldownMs: 30_000,
      isDaily: false,
      reason: "503 Model temporarily overloaded",
    };
  }

  if (status === 429) {
    const nextResetMs = getNextQuotaResetTimestampMs(nowMs);
    const untilMidnightMs = Math.max(60_000, nextResetMs - nowMs);

    // Check explicit limit: 0 (no quota on this key/tier for this model)
    if (/limit:\s*0\b/i.test(bodyText) || lower.includes("free_tier_requests") && lower.includes("limit: 0")) {
      return {
        kind: "limit_zero",
        cooldownMs: untilMidnightMs,
        isDaily: true,
        reason: "429 Model unavailable on this key tier (limit: 0)",
      };
    }

    // Check daily quota exhaustion indicators inside QuotaFailure details or message
    if (
      lower.includes("perday") ||
      lower.includes("per_day") ||
      lower.includes("requests per day") ||
      lower.includes("daily limit") ||
      lower.includes("spending cap")
    ) {
      return {
        kind: "daily_exhausted",
        cooldownMs: untilMidnightMs,
        isDaily: true,
        reason: "429 Daily quota exhausted (recovers at PT midnight)",
      };
    }

    // Parse RetryInfo retryDelay if provided (e.g. "retryDelay": "23s" or "retry in 18.4s")
    let retryDelayMs = 60_000;
    const jsonDelayMatch = bodyText.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
    const textDelayMatch = bodyText.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
    const rawSeconds = jsonDelayMatch?.[1] || textDelayMatch?.[1];
    if (rawSeconds) {
      const parsedMs = Math.ceil(parseFloat(rawSeconds) * 1000);
      if (!Number.isNaN(parsedMs)) {
        retryDelayMs = Math.min(Math.max(parsedMs, 15_000), 120_000);
      }
    }

    return {
      kind: "minute_rate_limit",
      cooldownMs: retryDelayMs,
      isDaily: false,
      reason: `429 Rate limited (cooling ${Math.round(retryDelayMs / 1000)}s)`,
    };
  }

  if (status >= 500) {
    return {
      kind: "server_error",
      cooldownMs: 15_000,
      isDaily: false,
      reason: `Upstream server error (${status})`,
    };
  }

  return {
    kind: "client_error",
    cooldownMs: 0,
    isDaily: false,
    reason: `Client error (${status})`,
  };
}