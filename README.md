<div align="center">
  <br />
  <img src="public/apple-icon.png" alt="GemPrism Logo" width="96" />
  <br /><br />

  <h1>GemPrism</h1>
  <p><strong>One gateway. Every key. Zero dropped requests.</strong></p>
  <p>
    Pool your Gemini API keys into a single high-availability gateway.<br />
    Intelligent routing, automatic failover, and a live dashboard, all in one place.
  </p>

  <br />

  <a href="https://gemprism.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20Demo-gemprism.vercel.app-6366f1?style=for-the-badge&logoColor=white" alt="Live Demo" />
  </a>
  &nbsp;
  <a href="https://github.com/XeCipher/GemPrism">
    <img src="https://img.shields.io/badge/GitHub-XeCipher%2FGemPrism-0f172a?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" />
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

  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=nextdotjs" />
  &nbsp;
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  &nbsp;
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  &nbsp;
  <img src="https://img.shields.io/badge/Vercel_KV-Upstash-00E9A3?style=flat-square&logo=upstash&logoColor=white" />
  &nbsp;
  <img src="https://img.shields.io/badge/Deployed-Vercel-000000?style=flat-square&logo=vercel&logoColor=white" />

  <br /><br />

</div>

---

## What is GemPrism?

GemPrism is a transparent proxy layer for the Google Gemini API. You add your own API keys, receive a single gateway token, and all requests through that token are distributed across your key pool in real time. Rate-limited keys cool down and recover automatically. Invalid keys are retired. The healthiest key always handles each request.

There is no new SDK to learn. Two configuration lines are all that changes in your existing code.

<br />

---

## Features

| Feature | Description |
| --- | --- |
| Intelligent Load Balancing | Routes each request to the key with the lowest per-model RPM and RPD counts at that exact moment |
| Auto-Cooldown and Retry | On a 429, the offending key is sidelined for 60 seconds and the request is instantly rerouted to the next healthy key |
| Dead Key Retirement | Keys returning a 403 are permanently flagged and removed from the routing pool |
| Model-Aware Rate Limits | Tracks usage per canonical model name, resolving aliases and `-latest` suffixes automatically |
| Real-Time Dashboard | Monitor key health, error rates, and granular per-model usage across your entire pool |
| Drop-In SDK Compatibility | Works with the official `@google/genai` SDK. Change `apiKey` and `baseUrl`, nothing else |

<br />

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Database and Auth | Supabase (PostgreSQL, Auth) |
| Runtime | Vercel Edge Runtime |

<br />

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

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

<br />

---

## Database Setup

Run the following in your Supabase SQL editor:

```sql
-- Gateway tokens (one per user, auto-generated on first login)
create table gateway_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  token         text not null unique,
  created_at    timestamptz default now()
);

-- API key pool
create table api_keys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  name            text,
  key_value       text not null,
  status          text default 'healthy',
  cooldown_until  bigint,
  total_requests  int default 0,
  total_errors    int default 0,
  last_error      text,
  last_used       bigint,
  created_at      timestamptz default now()
);

-- Per-model usage counters (one row per api_key + model combination)
create table model_usage (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  api_key_id        uuid references api_keys not null,
  model_name        text not null,
  rpd_count         int default 0,
  rpm_count         int default 0,
  rpd_date          date,
  rpm_window_start  bigint,
  unique (api_key_id, model_name)
);
```

Enable Row Level Security on all three tables and add appropriate policies so users can only read and write their own rows.

<br />

---

## Integration

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
  model: "gemini-pro-latest",
  contents: "Explain quantum entanglement in one sentence.",
});

console.log(response.text);
```

All model identifiers, request shapes, and response formats are identical to the native Gemini API. Nothing else in your codebase needs to change.

<br />

---

## Architecture

```
Your App  ->  GemPrism Edge Proxy  ->  Key Pool  ->  Google Generative Language API
```

### Request Flow

1. Incoming request carries your gateway token in `x-goog-api-key`
2. Token is resolved to a user account via `gateway_tokens`
3. The model name is extracted from the URL path and normalized to a canonical ID, resolving any alias or `-latest` suffix
4. All healthy API keys are fetched and hydrated with live per-model RPM and RPD usage
5. Keys that exceed their per-model limit are excluded; keys past their cooldown window are lazily recovered to healthy
6. The key with the lowest usage is selected (least-loaded routing)
7. The request is forwarded to the Google API verbatim using that key
8. On 429, the key enters a 60-second cooldown and the proxy advances to the next candidate
9. On 403, the key is permanently marked dead and excluded from all future routing
10. On success, usage counters for the key and model are upserted atomically

### Key States

| State | Condition | Behavior |
| --- | --- | --- |
| healthy | Default state | Eligible for routing |
| cooling | Received 429 | Excluded for 60 seconds, then lazily recovered |
| dead | Received 403 | Permanently excluded |

### Model Resolution

All model identifiers are normalized before usage is tracked or limits applied. This means `gemini-2.5-flash-latest`, `gemini-2.5-flash`, and any registered alias all resolve to the same canonical record with shared counters. The model registry lives in `src/lib/modelLimits.ts` and can be extended with new models or aliases without touching the proxy logic.

<br />

---

## Project Structure

```
GemPrism/
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── admin/stats/route.ts       # Dashboard stats endpoint (auth-gated)
    │   │   └── proxy/[...path]/route.ts   # Core gateway proxy (edge runtime)
    │   ├── dashboard/page.tsx             # Key management and telemetry dashboard
    │   ├── login/page.tsx                 # Sign in and sign up
    │   └── page.tsx                       # Marketing landing page
    ├── components/
    │   └── CodeBlock.tsx                  # Syntax-highlighted code display
    └── lib/
        ├── modelLimits.ts                 # Model registry, aliases, and rate limit config
        ├── supabase.ts                    # Client-side Supabase instance
        └── supabaseAdmin.ts               # Server-side Supabase admin instance
```

<br />

---

## Deployment

| Service | Platform | Notes |
| --- | --- | --- |
| Frontend and API | Vercel | Next.js with edge runtime; both proxy and admin routes run at the edge for minimal latency |
| Database and Auth | Supabase | Handles PostgreSQL, Auth, and Row Level Security |

When deploying, add the three environment variables from `.env.local` to your Vercel project settings. The `SUPABASE_SERVICE_ROLE_KEY` must be kept server-only and must not be prefixed with `NEXT_PUBLIC_`.

<br />

---

## Contributing

All contributions are welcome, whether that is a new model entry, a routing improvement, a dashboard feature, or a documentation fix.

For straightforward changes, open a pull request directly. For larger additions or behavioral changes, open an issue first so the direction can be discussed before implementation.

```bash
# Fork the repository and clone it
git clone https://github.com/XeCipher/GemPrism.git

# Create a branch for your change
git checkout -b feature/your-feature-name

# Make your changes and commit
git commit -m "feat: describe your change clearly"

# Push and open a Pull Request
git push origin feature/your-feature-name
```

<br />

---

## License

Distributed under the MIT License. See `LICENSE` for details.

<br />

---

Not affiliated with Google. Gemini is a trademark of Google LLC.
