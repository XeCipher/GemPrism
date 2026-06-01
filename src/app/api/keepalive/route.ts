import { NextResponse } from 'next/server';
import { supabaseClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET() {
  try {
    // Perform a lightweight query to register "activity" on Supabase
    const { data, error } = await supabaseClient
      .from('api_keys')
      .select('id')
      .limit(1);

    if (error) throw error;

    return NextResponse.json(
      { status: 'healthy', project: 'GemPrism', timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', message: err.message },
      { status: 500 }
    );
  }
}
