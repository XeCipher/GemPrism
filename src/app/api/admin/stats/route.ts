import { NextResponse } from 'next/server';
import { getHydratedKeys } from '@/lib/keyPool';

export const runtime = 'edge';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('X-Gateway-Token');
  if (authHeader !== process.env.GATEWAY_SECRET && authHeader !== `Bearer ${process.env.GATEWAY_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = await getHydratedKeys();
  const safeKeys = keys.map(({ key, ...safe }) => safe);

  return NextResponse.json({
    timestamp: Date.now(),
    keys: safeKeys,
    summary: {
      total_requests: safeKeys.reduce((acc, k) => acc + k.rpd_count, 0),
      active: safeKeys.filter(k => k.status === 'healthy').length,
      cooling: safeKeys.filter(k => k.status === 'cooling').length,
      dead: safeKeys.filter(k => k.status === 'dead').length,
      rpm_total: safeKeys.reduce((acc, k) => acc + k.rpm_count, 0)
    }
  });
}