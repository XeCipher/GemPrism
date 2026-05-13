import { NextResponse } from 'next/server';
import { getHydratedKeys } from '@/lib/keyPool';
import { ALL_MODELS } from '@/lib/modelLimits';
import { Redis } from '@upstash/redis';

export const runtime = 'edge';
const kv = Redis.fromEnv();

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('x-goog-api-key');
  if (authHeader !== process.env.GEMPRISM_SECRET && authHeader !== `Bearer ${process.env.GEMPRISM_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = await getHydratedKeys();
  const safeKeys = keys.map(({ key, ...safe }) => safe);
  const modelUsage = await kv.hgetall('prism:model_usage') || {};

  return NextResponse.json({
    timestamp: Date.now(),
    keys: safeKeys,
    models: ALL_MODELS,
    usage: modelUsage,
    summary: {
      total_requests: safeKeys.reduce((acc, k) => acc + k.rpd_count, 0),
      active: safeKeys.filter(k => k.status === 'healthy').length,
      cooling: safeKeys.filter(k => k.status === 'cooling').length,
      dead: safeKeys.filter(k => k.status === 'dead').length,
      rpm_total: safeKeys.reduce((acc, k) => acc + k.rpm_count, 0)
    }
  });
}