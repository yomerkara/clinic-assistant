import { NextResponse } from "next/server";
import { canManageKnowledge } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/http";
import { isFeatureFlag } from "@/lib/settings/control";
import { setAssistantEnabled, updateFeatureFlags } from "@/lib/settings/service";

export async function POST(request: Request) {
  const user = await requireUser();
  const origin = publicOrigin(request);
  // Clinic-wide switches belong to the administrator, like knowledge approval.
  if (!canManageKnowledge(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const back = (message: string) =>
    NextResponse.redirect(new URL(`/control?done=${message}`, origin), 303);

  if (intent === "assistant") {
    const enabled = String(form.get("enabled") ?? "") === "true";
    await setAssistantEnabled({
      enabled,
      actorId: user.id,
      reason: String(form.get("reason") ?? ""),
    });
    return back(enabled ? "assistant_on" : "assistant_off");
  }

  if (intent === "flag") {
    const flag = String(form.get("flag") ?? "");
    if (!isFeatureFlag(flag))
      return NextResponse.redirect(new URL("/control?error=flag", origin), 303);
    await updateFeatureFlags({
      patch: { [flag]: String(form.get("value") ?? "") === "true" },
      actorId: user.id,
    });
    return back("flag");
  }

  return NextResponse.redirect(new URL("/control?error=intent", origin), 303);
}
