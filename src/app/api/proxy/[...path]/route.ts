import { NextResponse } from 'next/server';
import { getHydratedKeys, updateKeyState } from '@/lib/keyPool';
import { getModelLimits } from '@/lib/modelLimits';

export const runtime = 'edge';

export async function POST(
  req: Request, 
  { params }: { params: Promise<{ path: string[] }> } // <-- Fixed for Next.js 15+
) {
  if (req.headers.get('X-Gateway-Token') !== process.env.GATEWAY_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Await the params!
  const resolvedParams = await params;
  const urlPath = resolvedParams.path.join('/');
  
  let modelName = 'default';
  const modelMatch = urlPath.match(/models\/([^:]+)/);
  if (modelMatch) modelName = modelMatch[1];
  
  const limits = getModelLimits(modelName);
  const payload = await req.text();
  const keys = await getHydratedKeys();

  let availableKeys = keys.filter(k => 
    k.status === 'healthy' && 
    k.rpm_count < limits.rpm && 
    k.rpd_count < limits.rpd
  );

  availableKeys.sort((a, b) => {
    if (a.rpd_count !== b.rpd_count) return a.rpd_count - b.rpd_count;
    return a.rpm_count - b.rpm_count;
  });

  if (availableKeys.length === 0) {
    return NextResponse.json({ error: 'All gateway nodes exhausted or cooling' }, { status: 503 });
  }

  for (const node of availableKeys) {
    try {
      const targetUrl = `https://generativelanguage.googleapis.com/${urlPath}?key=${node.key}`;
      
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (response.status === 429) {
        node.status = 'cooling';
        node.cooldown_until = Date.now() + 90000;
        node.total_errors++;
        node.last_error = '429 Rate Limited';
        await updateKeyState(node);
        continue;
      }

      if (response.status === 403 || response.status === 400) {
        node.status = 'dead';
        node.total_errors++;
        node.last_error = `API Error ${response.status}`;
        await updateKeyState(node);
        continue;
      }

      const data = await response.json();
      
      node.rpd_count++;
      node.rpm_count++;
      node.total_requests++;
      node.last_used = Date.now();
      await updateKeyState(node);

      return NextResponse.json(data, { status: 200 });

    } catch (err: any) {
      node.total_errors++;
      node.last_error = err.message || 'Network error';
      await updateKeyState(node);
    }
  }

  return NextResponse.json({ error: 'Gateway traversal failed' }, { status: 502 });
}