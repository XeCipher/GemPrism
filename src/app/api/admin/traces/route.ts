import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { clearRequestTraces, getRecentRequestTraces } from "@/lib/requestTraces";

export const runtime = "nodejs";
export const maxDuration = 60;

async function authenticateUser(req: Request) {
  const supabaseAdmin = getSupabaseAdminClient();
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!authHeader) return null;

  const { data: userAuth, error } = await supabaseAdmin.auth.getUser(authHeader);
  if (error || !userAuth.user) return null;
  return userAuth.user.id;
}

export async function GET(req: Request) {
  try {
    const userId = await authenticateUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await getRecentRequestTraces(userId, 40);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await authenticateUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await clearRequestTraces(userId);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}