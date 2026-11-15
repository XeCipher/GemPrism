<div align="center">
  <br />
  <img src="public/apple-icon.png" alt="GemPrism Logo" width="96" />
  <br /><br />

  <h1>GemPrism</h1>
  <p><strong>One gateway. Every key. Zero dropped requests.</strong></p>
  <p>
    Pool your Gemini API keys into a single high-availability gateway.<br />
    Dynamic model discovery, cascading failover, and a live telemetry dashboard, all in one place.
  </p>

  <br />

  <a href="https://gemprism.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20Demo-gemprism.vercel.app-6366f1?style=for-the-badge&amp;logoColor=white" alt="Live Demo" />
  </a>
  &nbsp;
  <a href="https://github.com/XeCipher/GemPrism">
    <img src="https://img.shields.io/badge/GitHub-XeCipher%2FGemPrism-0f172a?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="GitHub" />
  </a>
  &nbsp;
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="License" />
  </a>
  &nbsp;
  <a href="https://github.com/XeCipher/GemPrism/pulls">
    <img src="https://img.shields.io/badge/PRs-Welcome-f59e0b?style=for-the-badge" alt="PRs Welcome" />
  </a>

  <br /><br />

  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&amp;logo=nextdotjs" alt="Next.js 16" />
  &nbsp;
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript 5" />
  &nbsp;
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&amp;logo=tailwindcss&amp;logoColor=white" alt="Tailwind CSS 4" />
  &nbsp;
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&amp;logo=supabase&amp;logoColor=white" alt="Supabase PostgreSQL" />
  &nbsp;
  <img src="https://img.shields.io/badge/Deployed-Vercel-000000?style=flat-square&amp;logo=vercel&amp;logoColor=white" alt="Deployed on Vercel" />

  <br /><br />
</div>

---

## What is GemPrism?

GemPrism is a transparent proxy layer for the Google Gemini API. You add your own API keys, receive a single gateway token, and all requests through that token are distributed across your key pool in real time.

Instead of maintaining static rate-limit tables, GemPrism discovers live models directly from the Gemini API, learns rate limits dynamically from upstream error signals, isolates cooldowns per `(key, model)` pair, and cascades gracefully down compatible models whenever a tier is exhausted.

There is no new SDK to learn. Two configuration lines are all that changes in your existing code.

---

## Features

| Feature | Description |
| --- | --- |
| Live Model Discovery | Queries Google's `v1beta/models` endpoint automatically using your keys and classifies new releases without manual updates. |
| Cascading Key & Model Failover | Tries every healthy key first; when all keys exhaust a model (`429`, `503`, `404`), steps down smoothly (e.g., `Flash` → older `Flash` → `Flash-Lite` → `Hydrogen` / `Pro` → `Gemma`). |
| Limit-Agnostic Cooldowns | Detects `limit: 0`, `PerDay` resets (Pacific Time midnight), and `RetryInfo` delays directly from Google error responses. |
| Dynamic `-latest` Resolution | Automatically maps `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-pro-latest`, and future `-latest` tags to the newest matching live model. |
| Interactive Telemetry Dashboard | Stacked key-by-model charts, category donut breakdown, key × model cooldown heatmap, live RPM pulse, and searchable/filterable catalog. |
| Drop-In SDK Compatibility | Works with `@google/genai` and raw REST endpoints. Change `apiKey` and `baseUrl`, nothing else. |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Database and Auth | Supabase (PostgreSQL, Auth) |
| Runtime | Vercel Node.js Runtime |

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- A [Supabase](https://supabase.com) project
- One or more Google Gemini API keys

### Installation

```bash
git clone https://github.com/XeCipher/GemPrism.git
cd GemPrism
npm install
```

Create a `.env.local` file in the project root:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database Setup

Run the following SQL in your Supabase SQL editor:

```sql
-- Gateway tokens (one per user, auto-generated on first login)
create table gateway_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  token      text not null unique,
  created_at timestamptz default now()
);

-- API key pool
create table api_keys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  name           text,
  key_value      text not null,
  status         text default 'healthy',
  cooldown_until bigint,
  total_requests int default 0,
  total_errors   int default 0,
  last_error     text,
  last_used      bigint,
  created_at     timestamptz default now()
);

-- Per-model usage & cooldown counters
create table model_usage (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  api_key_id       uuid references api_keys not null,
  model_name       text not null,
  rpd_count        int default 0,
  rpm_count        int default 0,
  rpd_date         date,
  rpm_window_start bigint,
  unique (api_key_id, model_name)
);
```

Enable Row Level Security on all three tables and add appropriate policies so users can only read and write their own rows.

### Integration

Once your account is set up and at least one key is added, point the Google GenAI SDK at your GemPrism instance:

```typescript
import { GoogleGenAI } from "@google/genai";

// Use your GemPrism Gateway Token as the API key
// Point baseUrl at your GemPrism deployment
const ai = new GoogleGenAI({
  apiKey: "gp_live_your_gateway_token",
  baseUrl: "https://gemprism.vercel.app/api/proxy",
});

const response = await ai.models.generateContent({
  model: "gemini-flash-latest",
  contents: "Explain quantum entanglement in one sentence.",
});

console.log(response.text);
```

All model identifiers, request shapes, and response formats are identical to the native Gemini API. When failover occurs, GemPrism attaches `X-Gemprism-Model`, `X-Gemprism-Original-Model`, and `X-Gemprism-Fallback` headers to the response.

---

## Architecture

```text
Your App -> GemPrism Proxy -> Key Pool & Model Failover -> Google Generative Language API
```

### Request Flow

1. An incoming request carries your gateway token in `x-goog-api-key`, `key`, or `Authorization: Bearer`.
2. The token is resolved to a user account via `gateway_tokens`.
3. Live models are discovered from Google's `v1beta/models` API (cached for 15 minutes per user), and `-latest` aliases are resolved dynamically.
4. A compatibility-checked fallback chain is constructed for the requested model and endpoint method.
5. For each model in the chain, healthy keys not in per-model cooldown are sorted by lowest daily and per-minute load.
6. On `429`, the error payload is parsed (`limit: 0`, `PerDay`, or `RetryInfo`), and only that `(key, model)` pair cools down while traffic moves to the next key or next model.
7. On `403`, the key is retired as dead; on `503` or `404`, routing cascades to the next compatible model.
8. On success, per-key and per-model counters are updated atomically.

---

## Project Structure

```text
GemPrism/
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── admin/
    │   │   │   ├── keys/route.ts          # Key revive, cooldown reset, and deletion
    │   │   │   └── stats/route.ts         # Live catalog + telemetry endpoint
    │   │   ├── keepalive/route.ts         # Supabase keepalive probe
    │   │   └── proxy/[...path]/route.ts  # Core gateway proxy with cascading failover
    │   ├── dashboard/page.tsx             # Command center UI and model catalog
    │   ├── login/page.tsx                 # Sign in and sign up
    │   └── page.tsx                       # Marketing landing page
    ├── components/
    │   ├── AnalyticsCharts.tsx            # Interactive SVG/CSS graphs & heatmap
    │   ├── CodeBlock.tsx                  # Syntax-highlighted code display
    │   └── Logo.tsx                       # GemPrism SVG mark
    └── lib/
        ├── geminiModels.ts                # Live discovery, alias resolution & fallback engine
        ├── modelLimits.ts                 # Compatibility re-exports
        ├── supabase.ts                    # Client-side Supabase instance
        └── supabaseAdmin.ts               # Server-side Supabase admin instance
```

---

## Contributing

All contributions are welcome, whether that is a routing improvement, a dashboard visualization, or a documentation fix.

```bash
git clone https://github.com/XeCipher/GemPrism.git
cd GemPrism
git checkout -b feature/your-feature-name
git commit -m "feat: describe your change clearly"
git push origin feature/your-feature-name
```

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

Not affiliated with Google. Gemini is a trademark of Google LLC.