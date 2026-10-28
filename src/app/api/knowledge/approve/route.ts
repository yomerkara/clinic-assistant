import { NextResponse } from "next/server";
import { canManageKnowledge } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { approveDraftKnowledge, approvePendingKnowledge } from "@/lib/knowledge/sync";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!canManageKnowledge(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { id?: string; kind?: string };
  if (!body.id) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }
  if (body.kind === "draft") {
    await approveDraftKnowledge(body.id);
  } else {
    await approvePendingKnowledge(body.id);
  }
  return NextResponse.json({ ok: true });
}
