import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

async function authenticateUser(req: Request) {
  const supabaseAdmin = getSupabaseAdminClient();
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!authHeader) return null;

  const { data: userAuth, error } = await supabaseAdmin.auth.getUser(authHeader);
  if (error || !userAuth.user) return null;
  return { supabaseAdmin, userId: userAuth.user.id };
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supabaseAdmin, userId } = auth;
    const body = (await req.json()) as { action?: string; keyId?: string };

    if (body.action === "revive" && body.keyId) {
      await Promise.all([
        supabaseAdmin
          .from("api_keys")
          .update({
            status: "healthy",
            cooldown_until: null,
            last_error: null,
          })
          .eq("id", body.keyId)
          .eq("user_id", userId),
        supabaseAdmin
          .from("model_usage")
          .delete()
          .eq("api_key_id", body.keyId)
          .eq("user_id", userId)
          .like("model_name", "__cooldown:%"),
      ]);

      return NextResponse.json({ ok: true });
    }

    if (body.action === "clear_cooldowns") {
      let query = supabaseAdmin
        .from("model_usage")
        .delete()
        .eq("user_id", userId)
        .like("model_name", "__cooldown:%");

      if (body.keyId) {
        query = query.eq("api_key_id", body.keyId);
      }

      await query;

      if (body.keyId) {
        await supabaseAdmin
          .from("api_keys")
          .update({ status: "healthy", cooldown_until: null })
          .eq("id", body.keyId)
          .eq("user_id", userId)
          .neq("status", "dead");
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supabaseAdmin, userId } = auth;
    const keyId = new URL(req.url).searchParams.get("id");
    if (!keyId) {
      return NextResponse.json({ error: "Missing key id" }, { status: 400 });
    }

    // Delete dependent usage rows first so deletion succeeds regardless of cascade rules
    await supabaseAdmin
      .from("model_usage")
      .delete()
      .eq("api_key_id", keyId)
      .eq("user_id", userId);

    const { error } = await supabaseAdmin
      .from("api_keys")
      .delete()
      .eq("id", keyId)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}