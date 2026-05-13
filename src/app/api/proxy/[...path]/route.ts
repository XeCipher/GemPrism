import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getModelLimits } from '@/lib/modelLimits';

export const runtime = 'edge';

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const incomingToken = req.headers.get('x-goog-api-key');
  
  if (!incomingToken) return NextResponse.json({ error: 'Missing Gateway Token' }, { status: 401 });

  // 1. Identify User from Token
  const { data: tokenData } = await supabaseAdmin
    .from('gateway_tokens')
    .select('user_id')
    .eq('token', incomingToken)
    .single();

  if (!tokenData) return NextResponse.json({ error: 'Invalid Gateway Token' }, { status: 401 });
  const userId = tokenData.user_id;

  // 2. Resolve Path and Limits
  const resolvedParams = await params;
  const urlPath = resolvedParams.path.join('/');
  
  let modelName = 'default';
  const modelMatch = urlPath.match(/models\/([^:]+)/);
  if (modelMatch) modelName = modelMatch[1];
  
  const limits = getModelLimits(modelName);
  if (limits.rpd === 0) {
    return NextResponse.json({ error: `Model ${modelName} is waitlisted.` }, { status: 403 });
  }

  // 3. Fetch User's Keys
  const { data: keys } = await supabaseAdmin
    .from('api_keys')
    .select('*')
    .eq('user_id', userId);

  if (!keys || keys.length === 0) {
    return NextResponse.json({ error: 'No API keys uploaded to this Gateway.' }, { status: 400 });
  }

  const now = Date.now();
  const todayStr = new Date().toISOString().split('T')[0];

  // 4. Lazy Evaluation (Reset limits if time passed)
  const hydratedKeys = keys.map(node => {
    let mutated = false;
    if (node.rpd_date !== todayStr) {
      node.rpd_count = 0; node.rpd_date = todayStr; mutated = true;
    }
    if (now - node.rpm_window_start > 60000) {
      node.rpm_count = 0; node.rpm_window_start = now; mutated = true;
    }
    if (node.status === 'cooling' && now > node.cooldown_until) {
      node.status = 'healthy'; mutated = true;
    }
    return { ...node, mutated };
  });

  // Filter available nodes & Sort by lowest usage
  const availableNodes = hydratedKeys
    .filter(k => k.status === 'healthy' && k.rpm_count < limits.rpm && k.rpd_count < limits.rpd)
    .sort((a, b) => a.rpd_count !== b.rpd_count ? a.rpd_count - b.rpd_count : a.rpm_count - b.rpm_count);

  if (availableNodes.length === 0) {
    return NextResponse.json({ error: 'All gateway nodes exhausted or cooling' }, { status: 503 });
  }

  const payload = await req.text();

  // 5. Gateway Traversal
  for (const node of availableNodes) {
    try {
      const targetUrl = `https://generativelanguage.googleapis.com/${urlPath}?key=${node.key_value}`;
      
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (response.status === 429) {
        await updateNodeState(node.id, { 
          status: 'cooling', cooldown_until: now + 90000, 
          total_errors: node.total_errors + 1, last_error: '429 Rate Limited' 
        });
        continue; // Try next node
      }

      if (response.status === 403) {
        await updateNodeState(node.id, { 
          status: 'dead', total_errors: node.total_errors + 1, last_error: 'API Key Invalid (403)' 
        });
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json();
        return NextResponse.json(errorData, { status: response.status });
      }

      // Success! Update node and usage stats asynchronously
      const data = await response.json();
      
      Promise.all([
        updateNodeState(node.id, {
          rpd_count: node.rpd_count + 1,
          rpm_count: node.rpm_count + 1,
          total_requests: node.total_requests + 1,
          last_used: now,
          rpd_date: node.rpd_date,
          rpm_window_start: node.rpm_window_start,
          status: node.status // in case it recovered from cooling
        }),
        recordModelUsage(userId, modelName)
      ]).catch(console.error);

      return NextResponse.json(data, { status: 200 });

    } catch (err: any) {
      await updateNodeState(node.id, { total_errors: node.total_errors + 1, last_error: err.message });
    }
  }

  return NextResponse.json({ error: 'Gateway traversal failed' }, { status: 502 });
}

// Database Helpers
async function updateNodeState(id: string, updates: any) {
  await supabaseAdmin.from('api_keys').update(updates).eq('id', id);
}

async function recordModelUsage(userId: string, modelName: string) {
  // Upsert pattern for model tracking
  const { data } = await supabaseAdmin.from('model_usage').select('usage_count').eq('user_id', userId).eq('model_name', modelName).single();
  if (data) {
    await supabaseAdmin.from('model_usage').update({ usage_count: data.usage_count + 1 }).eq('user_id', userId).eq('model_name', modelName);
  } else {
    await supabaseAdmin.from('model_usage').insert({ user_id: userId, model_name: modelName, usage_count: 1 });
  }
}