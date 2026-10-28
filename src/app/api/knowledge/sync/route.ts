import { NextResponse } from "next/server";
import { canManageKnowledge } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { syncOfficialKnowledge } from "@/lib/knowledge/sync";

export async function POST() {
  const user = await requireUser();
  if (!canManageKnowledge(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const updates = await syncOfficialKnowledge();
  return NextResponse.json({ updates });
}
