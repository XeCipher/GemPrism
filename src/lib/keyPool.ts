import { kv } from '@vercel/kv';
import crypto from 'crypto';

export type KeyStatus = 'healthy' | 'cooling' | 'dead';

export interface KeyState {
  id: string;
  key: string;
  status: KeyStatus;
  rpd_count: number;
  rpd_date: string;
  rpm_count: number;
  rpm_window_start: number;
  cooldown_until: number;
  last_used: number;
  total_requests: number;
  total_errors: number;
  last_error: string;
}

export function hashKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 8);
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

const DEFAULT_STATE = (id: string, key: string): KeyState => ({
  id,
  key,
  status: 'healthy',
  rpd_count: 0,
  rpd_date: getTodayStr(),
  rpm_count: 0,
  rpm_window_start: Date.now(),
  cooldown_until: 0,
  last_used: 0,
  total_requests: 0,
  total_errors: 0,
  last_error: '',
});

export async function getHydratedKeys(): Promise<KeyState[]> {
  const rawKeys = process.env.GEMINI_KEYS || '[]';
  const keys: string[] = JSON.parse(rawKeys);
  const today = getTodayStr();
  const now = Date.now();
  
  const pipeline = kv.pipeline();
  const ids = keys.map(k => hashKey(k));
  
  ids.forEach(id => pipeline.get(`prism:key:${id}`));
  const results = await pipeline.exec<any[]>();

  const finalStates: KeyState[] =[];
  let needsSave = false;

  const savePipeline = kv.pipeline();

  for (let i = 0; i < keys.length; i++) {
    const keyStr = keys[i];
    const id = ids[i];
    let state: KeyState = results[i] ? results[i] : DEFAULT_STATE(id, keyStr);
    
    state.key = keyStr; 
    let mutated = false;

    if (state.rpd_date !== today) {
      state.rpd_count = 0;
      state.rpd_date = today;
      mutated = true;
    }

    if (now - state.rpm_window_start > 60000) {
      state.rpm_count = 0;
      state.rpm_window_start = now;
      mutated = true;
    }

    if (state.status === 'cooling' && now > state.cooldown_until) {
      state.status = 'healthy';
      mutated = true;
    }

    if (mutated || !results[i]) {
      savePipeline.set(`prism:key:${id}`, state);
      needsSave = true;
    }

    finalStates.push(state);
  }

  if (needsSave) await savePipeline.exec();
  return finalStates;
}

export async function updateKeyState(state: KeyState) {
  const { key, ...safeState } = state; 
  await kv.set(`prism:key:${state.id}`, safeState);
}