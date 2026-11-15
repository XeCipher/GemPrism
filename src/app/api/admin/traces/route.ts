import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  clearRequestTraces,
  getRequestTracesPage,
  type RequestTraceFilter,
} from "@/lib/requestTraces";

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

    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") || "40");
    const rawOffset = Number(url.searchParams.get("offset") || "0");
    const rawFilter = url.searchParams.get("filter");
    const search = url.searchParams.get("q") || "";

    const filter: RequestTraceFilter =
      rawFilter === "fallbacks" || rawFilter === "errors" ? rawFilter : "all";

    const result = await getRequestTracesPage(userId, {
      limit: Number.isFinite(rawLimit) ? rawLimit : 40,
      offset: Number.isFinite(rawOffset) ? rawOffset : 0,
      filter,
      search,
    });

    return NextResponse.json({
      traces: result.traces,
      total: result.total,
      hasMore: result.hasMore,
    });
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